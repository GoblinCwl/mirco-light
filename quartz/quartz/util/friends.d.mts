export type FriendLink = { id: string; name: string; url: string; backlinkUrl?: string; rssUrl?: string; avatar: string; avatarSource?: string; latestUpdate?: string; reviewResult?: string; reviewCheckedAt?: string; healthFailures?: number; healthCheckedOn?: string; healthError?: string; description: string; example?: boolean; status?: "展示中" | "待审核" | "已失效" }
export const defaultFriends: FriendLink[]
export function parseFriends(raw: unknown): FriendLink[]
