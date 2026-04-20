# `runtime-agent`

Small public API for stream-runtime agents.

Agents import only `defineAgent`, `defineReactor`, `SynapseEvent`,
`ReactorContext`, `ReactorDefinition`, and `AgentDefinition`. The helpers are
identity functions; they do not register agents, perform I/O, touch Postgres,
or enqueue BullMQ jobs.

The worker builds the runtime registry explicitly from registered
`AgentDefinition` values at startup.
