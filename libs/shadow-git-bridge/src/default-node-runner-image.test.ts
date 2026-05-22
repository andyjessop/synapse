import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF,
  resolveShadowNodeRunnerImageRef,
} from './default-node-runner-image';

describe('resolveShadowNodeRunnerImageRef', () => {
  it('uses default ref when env is unset', () => {
    const prev = {
      s: process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE,
      o: process.env.ORACLE_PREP_DOCKER_IMAGE,
      l: process.env.LABORATORY_DOCKER_IMAGE,
      d: process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST,
    };
    try {
      delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE;
      delete process.env.ORACLE_PREP_DOCKER_IMAGE;
      delete process.env.LABORATORY_DOCKER_IMAGE;
      delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST;
      expect(resolveShadowNodeRunnerImageRef()).toBe(
        DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF,
      );
    } finally {
      if (prev.s !== undefined) {
        process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE = prev.s;
      } else {
        delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE;
      }
      if (prev.o !== undefined) {
        process.env.ORACLE_PREP_DOCKER_IMAGE = prev.o;
      } else {
        delete process.env.ORACLE_PREP_DOCKER_IMAGE;
      }
      if (prev.l !== undefined) {
        process.env.LABORATORY_DOCKER_IMAGE = prev.l;
      } else {
        delete process.env.LABORATORY_DOCKER_IMAGE;
      }
      if (prev.d !== undefined) {
        process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST = prev.d;
      } else {
        delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST;
      }
    }
  });

  it('uses immutable digest ref when SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST is set', () => {
    const digestHex = 'e'.repeat(64);
    const prev = {
      s: process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE,
      o: process.env.ORACLE_PREP_DOCKER_IMAGE,
      l: process.env.LABORATORY_DOCKER_IMAGE,
      d: process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST,
    };
    try {
      delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE;
      delete process.env.ORACLE_PREP_DOCKER_IMAGE;
      delete process.env.LABORATORY_DOCKER_IMAGE;
      process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST = digestHex;
      expect(resolveShadowNodeRunnerImageRef()).toBe(
        `deus/shadow-node-runner@sha256:${digestHex}`,
      );
    } finally {
      if (prev.s !== undefined) {
        process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE = prev.s;
      } else {
        delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE;
      }
      if (prev.o !== undefined) {
        process.env.ORACLE_PREP_DOCKER_IMAGE = prev.o;
      } else {
        delete process.env.ORACLE_PREP_DOCKER_IMAGE;
      }
      if (prev.l !== undefined) {
        process.env.LABORATORY_DOCKER_IMAGE = prev.l;
      } else {
        delete process.env.LABORATORY_DOCKER_IMAGE;
      }
      if (prev.d !== undefined) {
        process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST = prev.d;
      } else {
        delete process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST;
      }
    }
  });
});
