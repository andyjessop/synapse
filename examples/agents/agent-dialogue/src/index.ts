export {
  DIALOGUE_INGRESS_SOURCE,
  type TriggerDialogueInput,
  triggerDialogue,
} from './ingress.js';
export {
  DIALOGUE_QUESTIONER_AGENT_NAME,
  dialogueQuestionerAgentDefinition,
} from './questioner.js';
export {
  DIALOGUE_RESPONDER_AGENT_NAME,
  dialogueResponderAgentDefinition,
} from './responder.js';

import { dialogueQuestionerAgentDefinition } from './questioner.js';
import { dialogueResponderAgentDefinition } from './responder.js';

/** Both agents required for the dialogue example scenario. */
export const dialogueAgentDefinitions = [
  dialogueQuestionerAgentDefinition,
  dialogueResponderAgentDefinition,
] as const;
