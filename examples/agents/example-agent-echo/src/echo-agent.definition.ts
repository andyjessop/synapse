import { defineAgent } from 'runtime-agent';

import runEchoAgent from './echo-agent.js';

export const exampleEchoAgent = defineAgent({
  name: 'example-echo',
  handles: ['example.ping.v1'],
  run: runEchoAgent,
});
