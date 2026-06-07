import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { getCommitMessageDiffContext } from './git';

type LlmCallResult =
  | { ok: true; response: string }
  | { ok: false; error_code: 'not_installed' | 'request_failed'; error?: string };

const SYSTEM_PROMPT = `You are a helpful assistant.
Answer the user's prompt directly and concisely.
You have no tools, so do not claim you inspected files, ran commands, or changed anything.`;

const COMMIT_MESSAGE_INSTRUCTION =
  'Generate a commit message using the following diff. Output strictly only the commit message text, less than 80 characters.';

const COMMIT_MESSAGE_MODEL_ID = 'gpt-5.4-mini';

type AvailableModel = ReturnType<ModelRegistry['getAvailable']>[number];

function createNoResourcesLoader(): ResourceLoader {
  const extensionsResult = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime(),
  };

  return {
    getExtensions: () => extensionsResult,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => SYSTEM_PROMPT,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNoModelSetupError(message: string): boolean {
  return /no models? available|no model selected|no api key|missing api key|api key.*not configured|not authenticated/i.test(message);
}

function extractAssistantText(messages: AgentSession['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message: any = messages[i];
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;

    return message.content
      .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('');
  }
  return '';
}

function extractAssistantError(messages: AgentSession['messages']): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message: any = messages[i];
    if (message?.role === 'assistant' && typeof message.errorMessage === 'string' && message.errorMessage.length > 0) {
      return message.errorMessage;
    }
  }
  return undefined;
}

function selectDefaultModel(availableModels: AvailableModel[], settingsManager: SettingsManager): AvailableModel {
  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModel = settingsManager.getDefaultModel();
  return (
    (defaultProvider && defaultModel
      ? availableModels.find((model) => model.provider === defaultProvider && model.id === defaultModel)
      : undefined) ?? availableModels[0]
  );
}

function selectCommitMessageModel(availableModels: AvailableModel[]): AvailableModel | undefined {
  return availableModels.find((model) => model.id === COMMIT_MESSAGE_MODEL_ID);
}

export async function generateCommitMessage(cwd: string, paths: string[], fallbackMessage: string): Promise<string> {
  try {
    const diffContext = await getCommitMessageDiffContext(cwd, paths);
    const result = await callLlmNoTools(cwd, `${COMMIT_MESSAGE_INSTRUCTION}\n\n${diffContext}`, {
      modelId: COMMIT_MESSAGE_MODEL_ID,
    });
    return result.ok && result.response.trim() ? result.response.trim() : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function callLlmNoTools(
  cwd: string,
  prompt: string,
  options: { modelId?: string } = {},
): Promise<LlmCallResult> {
  if (!prompt.trim()) {
    return { ok: false, error_code: 'request_failed', error: 'Prompt is required' };
  }

  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const availableModels = modelRegistry.getAvailable();

  if (availableModels.length === 0) {
    return { ok: false, error_code: 'not_installed' };
  }

  const selectedModel = options.modelId === COMMIT_MESSAGE_MODEL_ID
    ? selectCommitMessageModel(availableModels)
    : selectDefaultModel(availableModels, settingsManager);

  if (!selectedModel) {
    return { ok: false, error_code: 'not_installed' };
  }

  let session: AgentSession | undefined;
  try {
    const result = await createAgentSession({
      cwd,
      agentDir,
      authStorage,
      modelRegistry,
      model: selectedModel,
      thinkingLevel: 'off',
      noTools: 'all',
      resourceLoader: createNoResourcesLoader(),
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
    });
    session = result.session;
    session.setActiveToolsByName([]);

    let response = '';
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        response += event.assistantMessageEvent.delta;
      }
    });

    try {
      await session.prompt(prompt, { expandPromptTemplates: false });
    } finally {
      unsubscribe();
    }

    const assistantError = extractAssistantError(session.messages);
    if (assistantError) {
      return {
        ok: false,
        error_code: isNoModelSetupError(assistantError) ? 'not_installed' : 'request_failed',
        error: assistantError,
      };
    }

    return { ok: true, response: response || extractAssistantText(session.messages) };
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      ok: false,
      error_code: isNoModelSetupError(message) ? 'not_installed' : 'request_failed',
      error: message,
    };
  } finally {
    session?.dispose();
  }
}
