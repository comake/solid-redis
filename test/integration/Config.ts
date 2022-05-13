// Copied from https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/test/integration/Config.ts
import { joinFilePath } from '@solid/community-server';
import type { IModuleState } from 'componentsjs';
import { ComponentsManager } from 'componentsjs';

let cachedModuleState: IModuleState;

/**
 * Returns a component instantiated from a Components.js configuration.
 */
export async function instantiateFromConfig(componentUrl: string, configPaths: string | string[],
  variables?: Record<string, any>): Promise<any> {
  // Initialize the Components.js loader
  const mainModulePath = joinFilePath(__dirname, '../../');
  const manager = await ComponentsManager.build({ mainModulePath, logLevel: 'error', moduleState: cachedModuleState });
  cachedModuleState = manager.moduleState;

  if (!Array.isArray(configPaths)) {
    configPaths = [ configPaths ];
  }

  // Instantiate the component from the config(s)
  for (const configPath of configPaths) {
    await manager.configRegistry.register(configPath);
  }
  return await manager.instantiate(componentUrl, { variables });
}

export function getTestConfigPath(configFile: string): string {
  return joinFilePath(__dirname, 'config', configFile);
}

export function getDefaultVariables(port: number, baseUrl?: string): Record<string, any> {
  return {
    'urn:solid-server:default:variable:baseUrl': baseUrl ?? `http://localhost:${port}/`,
    'urn:solid-server:default:variable:port': port,
    'urn:solid-server:default:variable:loggingLevel': 'off',
    'urn:solid-server:default:variable:showStackTrace': true,
    'urn:solid-server:default:variable:seededPodConfigJson': null,
  };
}
