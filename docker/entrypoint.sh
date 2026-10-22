#!/bin/sh
# Railway mounts the volume over /vercel/sandbox as root. The server runs as
# nodeapp, so hand the mount point to that user before dropping privileges.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /vercel/sandbox
  chown nodeapp:nodejs /vercel/sandbox
  exec /usr/sbin/runuser -u nodeapp -- "$@"
fi

exec "$@"
