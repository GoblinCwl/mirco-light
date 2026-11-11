export type FriendLink = { id: string; name: string; url: string; avatar: string; description: string; example?: boolean; status?: "展示中" | "待审核" | "已失效" }
export const defaultFriends: FriendLink[]
export function parseFriends(raw: unknown): FriendLink[]
