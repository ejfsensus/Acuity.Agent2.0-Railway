import { braveLlmContextTool, webSearchTool } from './web-search'
import { sacredTextMcpTool } from './sacred-text'

export const researchTools = {
  web_search: webSearchTool,
  brave_llm_context: braveLlmContextTool,
  'sacred-text-mcp': sacredTextMcpTool,
}
