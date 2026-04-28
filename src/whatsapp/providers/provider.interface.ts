export interface IncomingMessage {
  from: string;
  text: string;
  id?: string;
}

export interface WhatsAppProvider {
  sendMessage(to: string, text: string): Promise<void>;
  sendTemplate(to: string, templateName: string, vars: Record<string, string>): Promise<void>;
  parseWebhook(payload: unknown): IncomingMessage | null;
  validateWebhookSignature(raw: Buffer, headers: Record<string, string | undefined>): boolean;
  verifyWebhook?(mode: string, token: string, challenge: string): string;
  assignToHuman?(conversationId: string): Promise<void>;
}
