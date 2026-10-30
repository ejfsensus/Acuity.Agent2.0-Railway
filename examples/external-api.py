#!/usr/bin/env python3
"""Call the Acuity sandbox or hosted research agent using a personal API key."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid


class AcuityClient:
    def __init__(self, url, key, timeout=180):
        self.url = url.rstrip('/')
        self.key = key
        self.timeout = timeout

    def request(self, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.url + path, data=data, headers={
            'Authorization': 'Bearer ' + self.key,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        })
        try:
            return urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read()).get('message', error.reason)
            except (ValueError, AttributeError):
                detail = error.reason
            raise RuntimeError('Acuity HTTP {}: {}'.format(error.code, detail)) from None

    def json(self, path, body=None):
        with self.request(path, body) as response:
            return json.load(response)

    def shell(self, commands, session_id=None):
        body = {'commands': commands} if len(commands) > 1 else {'command': commands[0]}
        if session_id:
            body['sessionId'] = session_id
        return self.json('/api/sandbox/shell', body)

    def ask(self, question, model):
        chat_id = str(uuid.uuid4())
        message = {'id': str(uuid.uuid4()), 'role': 'user', 'parts': [{'type': 'text', 'text': question}]}
        self.json('/api/chats', {'id': chat_id, 'mode': 'chat', 'message': message})
        answer = ''
        finish_reason = None
        errors = []
        with self.request('/api/chats/' + chat_id, {'model': model, 'messages': [message]}) as response:
            for raw in response:
                line = raw.decode().strip()
                if line == 'data: [DONE]':
                    break
                if not line.startswith('data: '):
                    continue
                event = json.loads(line[6:])
                kind = event.get('type', '')
                if kind.startswith('tool-'):
                    answer = ''
                elif kind == 'text-delta':
                    answer += event['delta']
                elif kind == 'finish':
                    finish_reason = event.get('finishReason', 'stop')
                elif kind == 'error':
                    errors.append(event.get('errorText', 'Generation failed'))
                elif kind == 'abort':
                    errors.append('Generation was cancelled')
        if errors or finish_reason != 'stop' or not answer.strip():
            raise RuntimeError('Incomplete research response; inspect {} before retrying. {}'.format(
                self.url + '/chat/' + chat_id, '; '.join(errors)))
        return {'chatId': chat_id, 'chatUrl': self.url + '/chat/' + chat_id, 'text': answer, 'finishReason': finish_reason}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=os.environ.get('SAVOIR_API_URL'))
    parser.add_argument('--timeout', type=float, default=180, help='Network read timeout in seconds, not a total research deadline')
    commands = parser.add_subparsers(dest='mode', required=True)
    ask = commands.add_parser('ask', help='Run the hosted agent and print its final answer as JSON')
    ask.add_argument('question')
    ask.add_argument('--model', default=os.environ.get('SAVOIR_MODEL', 'deepseek-flash'))
    shell = commands.add_parser('shell', help='Run read-only corpus commands; no hosted LLM call')
    shell.add_argument('commands', nargs='+')
    shell.add_argument('--session-id')
    args = parser.parse_args()
    key = os.environ.get('SAVOIR_API_KEY')
    if not args.url or not key:
        parser.error('Set SAVOIR_API_URL and SAVOIR_API_KEY first')
    client = AcuityClient(args.url, key, args.timeout)
    try:
        result = client.ask(args.question, args.model) if args.mode == 'ask' else client.shell(args.commands, args.session_id)
        print(json.dumps(result, ensure_ascii=False))
    except (RuntimeError, urllib.error.URLError, TimeoutError, ValueError) as error:
        print(json.dumps({'error': str(error).replace(key, '[redacted]')}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
