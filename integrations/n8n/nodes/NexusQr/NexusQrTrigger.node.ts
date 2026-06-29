import { createHmac } from 'node:crypto';
import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export class GenXQRTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GenXQR Trigger',
		name: 'GenXQRTrigger',
		icon: 'file:GenXQR.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Triggers when a QR code event occurs in GenXQR',
		defaults: {
			name: 'GenXQR Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'GenXQRApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'qr.scanned',
				options: [
					{
						name: 'QR Code Scanned',
						value: 'qr.scanned',
						description: 'Triggers when any QR code is scanned',
					},
					{
						name: 'QR Code Created',
						value: 'qr.created',
						description: 'Triggers when a new QR code is created',
					},
					{
						name: 'QR Code Updated',
						value: 'qr.updated',
						description: 'Triggers when a QR code is updated',
					},
					{
						name: 'QR Code Deleted',
						value: 'qr.deleted',
						description: 'Triggers when a QR code is deleted',
					},
				],
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description:
					'Whether to verify the HMAC-SHA256 signature on incoming webhooks. Disable only for debugging.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookId = webhookData.webhookId as string | undefined;
				if (!webhookId) return false;

				const credentials = await this.getCredentials('GenXQRApi');
				const baseUrl = (credentials.baseUrl as string || 'https://genxqr.in').replace(/\/$/, '');

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'GenXQRApi', {
						method: 'GET',
						url: `${baseUrl}/v1/webhooks/${webhookId}`,
						json: true,
					});
					return true;
				} catch {
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const event = this.getNodeParameter('event') as string;
				const webhookUrl = this.getNodeWebhookUrl('default');
				const credentials = await this.getCredentials('GenXQRApi');
				const baseUrl = (credentials.baseUrl as string || 'https://genxqr.in').replace(/\/$/, '');

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'GenXQRApi',
					{
						method: 'POST',
						url: `${baseUrl}/v1/webhooks`,
						body: {
							url: webhookUrl,
							event,
							source: 'n8n',
							name: `n8n — ${event}`,
						},
						json: true,
					},
				);

				const data = (response.data ?? response) as IDataObject;
				const webhookData = this.getWorkflowStaticData('node');
				webhookData.webhookId = data.id as string;
				webhookData.webhookSecret = data.secret as string;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookId = webhookData.webhookId as string | undefined;
				if (!webhookId) return true;

				const credentials = await this.getCredentials('GenXQRApi');
				const baseUrl = (credentials.baseUrl as string || 'https://genxqr.in').replace(/\/$/, '');

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'GenXQRApi', {
						method: 'DELETE',
						url: `${baseUrl}/v1/webhooks/${webhookId}`,
						json: true,
						returnFullResponse: true,
					});
				} catch {
					// Webhook may already have been deleted — ignore
				}

				delete webhookData.webhookId;
				delete webhookData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = this.getBodyData() as IDataObject;
		const verifySignature = this.getNodeParameter('verifySignature', true) as boolean;

		// ─── HMAC Signature Verification ─────────────────────────────
		if (verifySignature) {
			const webhookData = this.getWorkflowStaticData('node');
			const secret = webhookData.webhookSecret as string | undefined;

			if (secret) {
				const signatureHeader = req.headers['x-GenXQR-signature'] as string | undefined;
				if (!signatureHeader) {
					throw new NodeApiError(this.getNode(), {}, {
						message: 'Missing X-GenXQR-Signature header',
					});
				}

				// Header format: "sha256=<hex>"
				const expectedSig = signatureHeader.replace(/^sha256=/, '');
				const rawBody = JSON.stringify(body);
				const computedSig = createHmac('sha256', secret).update(rawBody).digest('hex');

				if (computedSig !== expectedSig) {
					throw new NodeApiError(this.getNode(), {}, {
						message: 'Invalid webhook signature — payload may have been tampered with',
					});
				}
			}
		}

		// ─── Extract event data ──────────────────────────────────────
		const eventData = (body.data ?? body) as IDataObject;
		const outputItem: IDataObject = {
			...eventData,
			event: body.event as string,
			timestamp: body.timestamp as string,
		};

		return {
			workflowData: [
				this.helpers.returnJsonArray([outputItem]),
			],
		};
	}
}
