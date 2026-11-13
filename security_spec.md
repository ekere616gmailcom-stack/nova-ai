# Nova Firestore Security Specification

## 1. Data Invariants
1. **User Isolation & PII Protection**: A `/users/{userId}` document may only be read (`get`), created, or updated by the verified authenticated user whose `request.auth.uid == userId`. Collection listing on `/users` is strictly prohibited.
2. **Chat Ownership**: A `/users/{userId}/chats/{chatId}` document belongs exclusively to `userId` and cannot exist unless the parent `/users/{userId}` document exists.
3. **Message Integrity**: A `/users/{userId}/chats/{chatId}/messages/{messageId}` document belongs to both `userId` and `chatId`, and cannot exist unless the parent chat document exists and is owned by `userId`.
4. **Immutable Ownership & Timestamps**: `uid`, `userId`, `chatId`, and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` timestamps must equal `request.time`.
5. **Strict Quota & Enum Boundaries**: `plan` must be `'free'` or `'premium'`; `language` must be one of `['en', 'es', 'fr', 'pt', 'ar', 'hi', 'zh']`; `voiceName` must be one of `['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']`; `dailyChatCount` must be an integer between `0` and `100000`.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated User Read**: Reading `/users/alice` with `auth == null`.
2. **Cross-User PII Read**: User `bob` attempting `get` on `/users/alice`.
3. **User Collection Scraping**: User `bob` attempting `list` on `/users`.
4. **Unverified Email Write**: User with `email_verified: false` attempting `create` on `/users/bob`.
5. **Shadow Ghost Field Injection**: Creating `/users/bob` with extra field `isAdmin: true` or `credits: 999999`.
6. **Identity Spoofing on Create**: User `bob` creating `/users/bob/chats/c1` with `userId: "alice"`.
7. **ID Poisoning Attack**: Creating a chat with a 200-char or invalid-character `chatId` (`"bad/id$123"`).
8. **Client-Spoofed Timestamp**: Creating `/users/bob/chats/c1` with `createdAt` set to a past client timestamp instead of `request.time`.
9. **Immutable Field Tampering**: Updating `/users/bob` to change `uid` or `createdAt`.
10. **Invalid Enum Injection**: Updating `/users/bob` with `plan: "enterprise_free_forever"` or `language: "klingon"`.
11. **Oversized Content DoS**: Creating a message with `content` length > 50,000 bytes or `imageDataUrl` > 400,000 bytes.
12. **Orphaned Message Creation**: Creating `/users/bob/chats/nonexistent/messages/m1` when parent chat does not exist.
