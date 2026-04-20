import type { EventDataFor } from 'runtime-events';

export type PiHarnessSynapseEventType =
  | 'pi.tool-call.started.v1'
  | 'pi.tool-call.completed.v1';

export type PiHarnessSynapseEmit = <TType extends PiHarnessSynapseEventType>(
  type: TType,
  data: EventDataFor<TType>,
  externalId: string,
) => Promise<void>;
