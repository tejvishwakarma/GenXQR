import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export class GenXQR implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GenXQR',
		name: 'GenXQR',
		icon: 'file:GenXQR.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create, manage, and track dynamic QR codes with GenXQR',
		defaults: {
			name: 'GenXQR',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'GenXQRApi',
				required: true,
			},
		],
		properties: [
			// ─── Resource ────────────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'QR Code', value: 'qrCode' },
					{ name: 'Analytics', value: 'analytics' },
					{ name: 'Scans', value: 'scans' },
				],
				default: 'qrCode',
			},

			// ─── QR Code Operations ──────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['qrCode'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a QR code', description: 'Create a new dynamic QR code' },
					{ name: 'Delete', value: 'delete', action: 'Delete a QR code', description: 'Permanently delete a QR code' },
					{ name: 'Get', value: 'get', action: 'Get a QR code', description: 'Retrieve a single QR code by ID' },
					{ name: 'List', value: 'list', action: 'List QR codes', description: 'List all QR codes' },
					{ name: 'Toggle', value: 'toggle', action: 'Toggle a QR code', description: 'Activate or deactivate a QR code' },
					{ name: 'Update Destination', value: 'updateDestination', action: 'Update QR destination', description: 'Change the redirect URL of a QR code' },
				],
				default: 'create',
			},

			// ─── Analytics Operations ────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['analytics'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get analytics', description: 'Get analytics for a QR code' },
				],
				default: 'get',
			},

			// ─── Scans Operations ────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['scans'] } },
				options: [
					{ name: 'List', value: 'list', action: 'List scans', description: 'List recent scans for a QR code' },
				],
				default: 'list',
			},

			// ─── Fields: QR Code Create ──────────────────────────────────────
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: 'Internal label for this QR code',
				displayOptions: { show: { resource: ['qrCode'], operation: ['create'] } },
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				required: true,
				default: 'URL',
				options: [
					{ name: 'URL', value: 'URL' },
					{ name: 'WhatsApp', value: 'WHATSAPP' },
					{ name: 'Instagram', value: 'INSTAGRAM' },
					{ name: 'Facebook', value: 'FACEBOOK' },
				],
				description: 'The content type. For non-URL types use the GenXQR dashboard.',
				displayOptions: { show: { resource: ['qrCode'], operation: ['create'] } },
			},
			{
				displayName: 'Destination URL',
				name: 'destinationUrl',
				type: 'string',
				required: true,
				default: '',
				description: 'The URL users will be redirected to when they scan this QR code',
				displayOptions: { show: { resource: ['qrCode'], operation: ['create'] } },
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description: 'Comma-separated tags for organization (max 10)',
				displayOptions: { show: { resource: ['qrCode'], operation: ['create'] } },
			},

			// ─── Fields: QR Code ID (shared) ─────────────────────────────────
			{
				displayName: 'QR Code ID',
				name: 'qrId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID of the QR code',
				displayOptions: {
					show: {
						resource: ['qrCode'],
						operation: ['get', 'delete', 'toggle', 'updateDestination'],
					},
				},
			},
			{
				displayName: 'QR Code ID',
				name: 'qrId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID of the QR code',
				displayOptions: { show: { resource: ['analytics'], operation: ['get'] } },
			},
			{
				displayName: 'QR Code ID',
				name: 'qrId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID of the QR code',
				displayOptions: { show: { resource: ['scans'], operation: ['list'] } },
			},

			// ─── Fields: Update Destination ──────────────────────────────────
			{
				displayName: 'New Destination URL',
				name: 'destinationUrl',
				type: 'string',
				required: true,
				default: '',
				description: 'The new URL users will be redirected to',
				displayOptions: { show: { resource: ['qrCode'], operation: ['updateDestination'] } },
			},

			// ─── Fields: List QR Codes ───────────────────────────────────────
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 50 },
				default: 20,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['qrCode'], operation: ['list'] } },
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 1,
				description: 'Page number',
				displayOptions: { show: { resource: ['qrCode'], operation: ['list'] } },
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Filter QR codes by name or slug',
				displayOptions: { show: { resource: ['qrCode'], operation: ['list'] } },
			},

			// ─── Fields: Analytics ───────────────────────────────────────────
			{
				displayName: 'Days',
				name: 'days',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 90 },
				default: 30,
				description: 'Number of days to look back (max 90)',
				displayOptions: { show: { resource: ['analytics'], operation: ['get'] } },
			},

			// ─── Fields: Scans List ──────────────────────────────────────────
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 25,
				description: 'Max number of scans to return',
				displayOptions: { show: { resource: ['scans'], operation: ['list'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = await this.getCredentials('GenXQRApi');
		const baseUrl = (credentials.baseUrl as string || 'https://genxqr.in').replace(/\/$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[];

				// ─── QR Code ─────────────────────────────────────────────
				if (resource === 'qrCode') {
					if (operation === 'create') {
						const name = this.getNodeParameter('name', i) as string;
						const type = this.getNodeParameter('type', i) as string;
						const destinationUrl = this.getNodeParameter('destinationUrl', i) as string;
						const tagsRaw = this.getNodeParameter('tags', i, '') as string;
						const tags = tagsRaw
							? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10)
							: [];

						const body = {
							name,
							type,
							category: 'DYNAMIC',
							tags,
							content: { data: { url: destinationUrl } },
						};

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'POST',
								url: `${baseUrl}/v1/qr`,
								body,
								json: true,
							},
						);
						responseData = (response.data ?? response) as IDataObject;
					} else if (operation === 'get') {
						const qrId = this.getNodeParameter('qrId', i) as string;
						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'GET',
								url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}`,
								json: true,
							},
						);
						responseData = (response.data ?? response) as IDataObject;
					} else if (operation === 'list') {
						const limit = this.getNodeParameter('limit', i) as number;
						const page = this.getNodeParameter('page', i) as number;
						const search = this.getNodeParameter('search', i, '') as string;

						const qs: IDataObject = { page, limit };
						if (search) qs.search = search;

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'GET',
								url: `${baseUrl}/v1/qr`,
								qs,
								json: true,
							},
						);
						responseData = (response.data ?? response) as IDataObject[];
					} else if (operation === 'updateDestination') {
						const qrId = this.getNodeParameter('qrId', i) as string;
						const destinationUrl = this.getNodeParameter('destinationUrl', i) as string;

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'PATCH',
								url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}`,
								body: { content: { data: { url: destinationUrl } } },
								json: true,
							},
						);
						responseData = (response.data ?? response) as IDataObject;
					} else if (operation === 'toggle') {
						const qrId = this.getNodeParameter('qrId', i) as string;
						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'PATCH',
								url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}/toggle`,
								json: true,
							},
						);
						responseData = (response.data ?? response) as IDataObject;
					} else if (operation === 'delete') {
						const qrId = this.getNodeParameter('qrId', i) as string;
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							'GenXQRApi',
							{
								method: 'DELETE',
								url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}`,
								json: true,
								returnFullResponse: true,
							},
						);
						responseData = { deleted: true, id: qrId };
					} else {
						throw new NodeApiError(this.getNode(), {}, { message: `Unknown operation: ${operation}` });
					}
				}

				// ─── Analytics ────────────────────────────────────────────
				else if (resource === 'analytics') {
					const qrId = this.getNodeParameter('qrId', i) as string;
					const days = this.getNodeParameter('days', i, 30) as number;

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'GenXQRApi',
						{
							method: 'GET',
							url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}/analytics`,
							qs: { days },
							json: true,
						},
					);
					responseData = (response.data ?? response) as IDataObject;
				}

				// ─── Scans ───────────────────────────────────────────────
				else if (resource === 'scans') {
					const qrId = this.getNodeParameter('qrId', i) as string;
					const limit = this.getNodeParameter('limit', i, 25) as number;

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'GenXQRApi',
						{
							method: 'GET',
							url: `${baseUrl}/v1/qr/${encodeURIComponent(qrId)}/scans`,
							qs: { limit },
							json: true,
						},
					);
					responseData = (response.data ?? response) as IDataObject[];
				} else {
					throw new NodeApiError(this.getNode(), {}, { message: `Unknown resource: ${resource}` });
				}

				// Normalize to array for consistent output
				const outputItems = Array.isArray(responseData!)
					? responseData.map((item) => ({ json: item }))
					: [{ json: responseData! }];
				returnData.push(...outputItems);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
