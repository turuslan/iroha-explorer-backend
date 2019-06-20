import * as dockerode from 'dockerode';
import { StartedTestContainer } from 'testcontainers/dist/test-container';

/** HACK: get dockerode client */
const dockerodeContainer = (instance: StartedTestContainer) => (instance as any).container.container as dockerode.Container;

/** HACK: get ip address via docker inspect */
export async function inspectIp(instance: StartedTestContainer) {
  const result = await dockerodeContainer(instance).inspect();
  return result.NetworkSettings.IPAddress;
}
