/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { InputError } from '@backstage/errors';
import {
  DefaultAzureDevOpsCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  WebApi,
  getBearerHandler,
  getPersonalAccessTokenHandler,
} from 'azure-devops-node-api';

export function createAzureDevopsCreatePipelineAction(options: {
  integrations: ScmIntegrationRegistry;
}) {
  const { integrations } = options;

  return createTemplateAction<{
    host?: string;
    organization: string;
    project: string;
    folder: string;
    name: string;
    repositoryId: string;
    repositoryName: string;
    yamlPath?: string;
    token?: string;
  }>({
    id: 'azure:pipeline:create',
    schema: {
      input: {
        required: [
          'organization',
          'project',
          'folder',
          'name',
          'repositoryId',
          'repositoryName',
        ],
        type: 'object',
        properties: {
          host: {
            type: 'string',
            title: 'Host',
            description: 'The host of Azure DevOps. Defaults to dev.azure.com',
          },
          organization: {
            type: 'string',
            title: 'Organization',
            description: 'The name of the Azure DevOps organization.',
          },
          project: {
            type: 'string',
            title: 'Project',
            description: 'The name of the Azure project.',
          },
          folder: {
            type: 'string',
            title: 'Folder',
            description: 'The name of the folder of the pipeline.',
          },
          name: {
            type: 'string',
            title: 'Name',
            description: 'The name of the pipeline.',
          },
          repositoryId: {
            type: 'string',
            title: 'Repository ID',
            description: 'The ID of the repository.',
          },
          repositoryName: {
            type: 'string',
            title: 'Repository Name',
            description: 'The name of the repository.',
          },
          yamlPath: {
            type: 'string',
            title: 'Azure DevOps Pipelines Definition',
            description:
              'The location of the Azure DevOps Pipeline definition file. Defaults to /azure-pipelines.yaml',
          },
          token: {
            title: 'Authentication Token',
            type: 'string',
            description: 'The token to use for authorization.',
          },
        },
      },
      output: {
        type: 'object',
        required: ['pipelineId', 'pipelineUrl'],
        properties: {
          pipelineId: {
            type: 'string',
            title: 'Pipeline ID',
            description: 'The ID of the Azure DevOps pipeline.',
          },
          pipelineUrl: {
            type: 'string',
            title: 'Pipeline URL',
            description: 'The URL of the Azure DevOps pipeline.',
          },
        },
      },
    },
    async handler(ctx) {
      const {
        host = 'dev.azure.com',
        organization,
        project,
        folder,
        name,
        repositoryId,
        yamlPath,
        repositoryName,
      } = ctx.input;

      const url = `https://${host}/${organization}`;
      const credentialProvider =
        DefaultAzureDevOpsCredentialsProvider.fromIntegrations(integrations);
      const credentials = await credentialProvider.getCredentials({ url: url });

      if (credentials === undefined && ctx.input.token === undefined) {
        throw new InputError(
          `No credentials provided ${url}, please check your integrations config`,
        );
      }

      const authHandler =
        ctx.input.token || credentials?.type === 'pat'
          ? getPersonalAccessTokenHandler(ctx.input.token ?? credentials!.token)
          : getBearerHandler(credentials!.token);

      const webApi = new WebApi(url, authHandler);
      const client = await webApi.getPipelinesApi();
      // const createOptions: CreatePipelineParameters = {
      //   folder: folder, // Folder where the pipeline will be created
      //   name: name, // Name of the pipeline,
      //   configuration: {
      //     type: 1, // 1 for YAML pipeline
      //   },
      // };
      const createOptions = {
        folder: folder,
        name: name,
        configuration: {
          type: 1,
          path: yamlPath ?? '/azure-pipelines.yaml',
          repository: {
            id: repositoryId,
            name: repositoryName,
            type: 'azureReposGit',
          },
        },
      };

      const pipelineCreate = await client.createPipeline(
        createOptions,
        project,
      );

      // Log the createOptions object in a readable format
      ctx.logger.debug(
        'Create options for create the pipeline:',
        JSON.stringify(createOptions, null, 2),
      );
      ctx.logger.info(`The Azure pipeline ID is ${pipelineCreate.id}.`);

      ctx.output('pipelineId', pipelineCreate.id?.toString());
      ctx.output('pipelineUrl', pipelineCreate._links.web.href);
    },
  });
}
