/**
 * LLM step executors
 * Implements: llm.classify, llm.generate, llm.decide
 */

import type { Step, LlmConfig } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';

type LlmClassify = Extract<Step, { type: 'llm.classify' }>;
type LlmGenerate = Extract<Step, { type: 'llm.generate' }>;
type LlmDecide = Extract<Step, { type: 'llm.decide' }>;

/**
 * Generate text using the configured LLM provider
 */
async function generateText(prompt: string, config: LlmConfig): Promise<string> {
  const { provider, model, api_key, base_url } = config;

  if (provider === 'openai') {
    const url = `${base_url || 'https://api.openai.com/v1'}/chat/completions`;
    const modelName = model || 'gpt-5.4-mini';
    const apiKey = api_key || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new WorkflowError('OpenAI API key not configured', 'LLM_ERROR');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new WorkflowError(`OpenAI API error: ${error}`, 'LLM_ERROR');
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const url = `${base_url || 'https://api.anthropic.com/v1'}/messages`;
    const modelName = model || 'claude-3-haiku-20240307';
    const apiKey = api_key || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new WorkflowError('Anthropic API key not configured', 'LLM_ERROR');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new WorkflowError(`Anthropic API error: ${error}`, 'LLM_ERROR');
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };
    const textContent = data.content.find((c) => c.type === 'text');
    return textContent?.text || '';
  }

  if (provider === 'ollama') {
    const url = base_url || 'http://localhost:11434/api/generate';
    const modelName = model || 'llama2';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new WorkflowError(`Ollama API error: ${error}`, 'LLM_ERROR');
    }

    const data = (await response.json()) as { response: string };
    return data.response || '';
  }

  throw new WorkflowError(`Unknown LLM provider: ${provider}`, 'LLM_ERROR');
}

export async function executeLlmClassify(
  step: LlmClassify,
  ctx: ExecutionContext
): Promise<void> {
  const input = ctx.interpolate(step.input);
  const categories = step.categories;

  ctx.emitLog('info', `Classifying input into categories: ${categories.join(', ')}`);

  const prompt = `Classify the following text into exactly one of these categories: ${categories.join(', ')}.

Text: ${input}

Respond with ONLY the category name, nothing else.`;

  // Prepend user contexts if available
  const fullPrompt = ctx.userContexts.length > 0
    ? `=== IMPORTANT USER CONTEXT ===\n${ctx.userContexts.join('\n\n')}\n\n=== TASK ===\n${prompt}`
    : prompt;

  console.log(`\n[llm.classify] Full prompt (${fullPrompt.length} chars, ${ctx.userContexts.length} contexts):\n${fullPrompt}\n`);
  ctx.emitLog('info', `LLM classify prompt: ${fullPrompt.length} chars, ${ctx.userContexts.length} contexts, sample: "${fullPrompt.slice(0, 100)}..."`);

  const result = await generateText(fullPrompt, ctx.llmConfig);
  const cleaned = result.trim();

  ctx.lastStepResult = cleaned;
  ctx.variables[step.as] = cleaned;
}

export async function executeLlmGenerate(
  step: LlmGenerate,
  ctx: ExecutionContext
): Promise<void> {
  const prompt = ctx.interpolate(step.prompt);

  // Prepend user contexts if available
  const fullPrompt = ctx.userContexts.length > 0
    ? `=== IMPORTANT USER CONTEXT ===\n${ctx.userContexts.join('\n\n')}\n\n=== TASK ===\n${prompt}`
    : prompt;

  console.log(`\n[llm.generate] Full prompt (${fullPrompt.length} chars, ${ctx.userContexts.length} contexts):\n${fullPrompt}\n`);
  ctx.emitLog(
    'info',
    `Generating with LLM (prompt: ${fullPrompt.length} chars, contexts: ${ctx.userContexts.length}, provider: ${ctx.llmConfig.provider}, sample: "${fullPrompt.slice(0, 100)}...")`
  );

  const result = await generateText(fullPrompt, ctx.llmConfig);

  ctx.lastStepResult = result;
  ctx.variables[step.as] = result;
}

export async function executeLlmDecide(
  step: LlmDecide,
  ctx: ExecutionContext
): Promise<void> {
  const input = ctx.interpolate(step.input);
  const actions = step.actions;
  const actionIds = actions.map((a) => a.id);

  ctx.emitLog('info', `Deciding action from: ${actionIds.join(', ')}`);

  const actionList = actions
    .map((a) => `- ${a.id}: ${a.description}`)
    .join('\n');

  const prompt = `You received this situation and need to decide what to do.

Situation:
${input}

Available actions:
${actionList}

Pick the single action that best fits your role and expertise. Respond with ONLY the action id, nothing else.`;

  // Prepend user contexts if available
  const fullPrompt = ctx.userContexts.length > 0
    ? `=== IMPORTANT USER CONTEXT ===\n${ctx.userContexts.join('\n\n')}\n\n=== TASK ===\n${prompt}`
    : prompt;

  console.log(`\n[llm.decide] Full prompt (${fullPrompt.length} chars, ${ctx.userContexts.length} contexts):\n${fullPrompt}\n`);
  ctx.emitLog('info', `LLM decide prompt: ${fullPrompt.length} chars, ${ctx.userContexts.length} contexts, actions: [${actionIds.join(', ')}]`);

  const result = await generateText(fullPrompt, ctx.llmConfig);
  const cleaned = result.trim();

  // Validate the result is one of the action IDs
  if (!actionIds.includes(cleaned)) {
    ctx.emitLog('warn', `LLM returned "${cleaned}" which is not a valid action ID, finding closest match`);
    const match = actionIds.find((id) => cleaned.toLowerCase().includes(id.toLowerCase()));
    if (match) {
      ctx.lastStepResult = match;
      ctx.variables[step.as] = match;
      ctx.emitLog('info', `Matched to action: ${match}`);
      return;
    }
    // Fall back to first action
    ctx.emitLog('warn', `No match found, defaulting to: ${actionIds[0]}`);
    ctx.lastStepResult = actionIds[0];
    ctx.variables[step.as] = actionIds[0];
    return;
  }

  ctx.lastStepResult = cleaned;
  ctx.variables[step.as] = cleaned;
}
