import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GenXQRApi implements ICredentialType {
	name = 'GenXQRApi';
	displayName = 'GenXQR API';
	documentationUrl = 'https://genxqr.in/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create an API key at https://genxqr.in/app/api-keys. Requires a PRO plan or higher. The key starts with nxqr_.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://genxqr.in',
			description: 'The base URL of the GenXQR API. Override for self-hosted or staging instances.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/qr',
			qs: { page: 1, limit: 1 },
		},
	};
}
