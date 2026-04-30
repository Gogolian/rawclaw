import { callAnthropic } from './anthropic.js';
import { loadConversation, saveConversation } from './memory.js';
import { getToolSchemas, getTool } from './tools.js';
import { logger } from './logger.js';

const MAX_TOOL_ITERATIONS = 10;

/**
 * Run the agent loop for a single user message.
 *
 * 1. Load conversation history from memory
 * 2. Append the user message
 * 3. Call Anthropic
 * 4. If the response contains tool_use blocks, execute them and loop
 * 5. Persist messages after each turn
 * 6. Return the final assistant text
 *
 * @param {object} opts
 * @param {string} opts.userMessage - The user's input text
 * @param {string} opts.conversationId - ID for loading/saving memory
 * @param {object} opts.config - The loaded config object
 * @returns {Promise<string>} The final assistant text response
 */
async function runAgent({ userMessage, conversationId, config }) {
  const messages = loadConversation(conversationId);

  messages.push({ role: 'user', content: userMessage });

  const toolSchemas = getToolSchemas();

  let iterations = 0;
  let finalText = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await callAnthropic({
      apiKey: config.apiKey,
      model: config.model,
      system: config.system,
      messages,
      tools: toolSchemas,
      maxTokens: config.maxTokens,
    });

    logger.debug(`Anthropic response stop_reason: ${response.stop_reason}`);

    // Collect assistant content blocks
    const assistantContent = response.content ?? [];

    // Save the assistant turn
    messages.push({ role: 'assistant', content: assistantContent });

    // Extract any text blocks for the final response
    const textBlocks = assistantContent.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map((b) => b.text).join('\n');
    }

    // If no tool use, we are done
    if (response.stop_reason !== 'tool_use') {
      break;
    }

    // Execute each tool_use block and collect results
    const toolUseBlocks = assistantContent.filter((b) => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      logger.info(`Running tool: ${toolUse.name}`);
      const tool = getTool(toolUse.name);

      let resultContent;
      if (!tool) {
        resultContent = `Error: unknown tool '${toolUse.name}'`;
      } else {
        try {
          const output = await tool.run(toolUse.input, config);
          resultContent = typeof output === 'string' ? output : JSON.stringify(output);
        } catch (err) {
          resultContent = `Error: ${err.message}`;
        }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
      });
    }

    // Append tool results as a user turn and continue the loop
    messages.push({ role: 'user', content: toolResults });

    // Persist after each tool round-trip
    saveConversation(conversationId, messages);
  }

  // Final save
  saveConversation(conversationId, messages);

  return finalText;
}

export { runAgent };
