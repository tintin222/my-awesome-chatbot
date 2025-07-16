import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { google } from '@ai-sdk/google';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-2-vision-1212'),
        'chat-model-fast': google('models/gemini-2.5-flash-preview-06-17'),
        'gemini-2.5-pro-preview': google('models/gemini-2.5-pro-preview-03-25'),
        'gemini-2.0-flash': google('models/gemini-2.0-flash'),
        'gemini-2.0-flash-lite': google('models/gemini-2.0-flash-lite'),
        'gemini-1.5-flash': google('models/gemini-1.5-flash'),
        'gemini-1.5-pro': google('models/gemini-1.5-pro'),
        'chat-model-reasoning': wrapLanguageModel({
          model: xai('grok-3-mini-beta'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': google('models/gemini-2.5-flash-preview-06-17'),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
