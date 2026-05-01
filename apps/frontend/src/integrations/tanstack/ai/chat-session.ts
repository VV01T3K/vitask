export const DEMO_CHAT_ID = "vitask-demo-chat";

export function isDemoChatId(chatId: string | null): chatId is typeof DEMO_CHAT_ID {
  return chatId === DEMO_CHAT_ID;
}
