# dGroup — P2P Group Chat with Engine-Powered Search

A real-time peer-to-peer group chat on [GenosDB](https://github.com/estebanrfp/gdb) with **cryptographically signed messages** and **full-text search running through the query engine**.

## What makes dGroup different

- **`$text` search**: full-text, accent-folding search executed by GenosDB's query engine — not a client-side filter. Click any sender's name to filter the room to their messages.
- **Recent activity widget**: a second live subscription with `$limit: 5` — the engine manages the realtime window itself, evicting the oldest entry as new messages arrive.
- **Signed messages**: pick any display name; your signing address always shows beside it. Impersonation is visible by construction.
- **Governance**: `guest` reads → `member` chats (~10 s) → `moderator` deletes any message (10 messages sent); the demo superadmin signs promotions.
- Follows the [GenosDB Design Guide](https://github.com/estebanrfp/gdb/blob/main/docs/genosdb-design-guide.md): design tokens (dark), centered identity dialog, session top-right as `0x… [role]`, toasts.

| Role | Capabilities | How it is earned |
|---|---|---|
| `guest` | read the room | You start here |
| `member` | send messages | ~10 s after signing in |
| `moderator` | delete any message | 10 messages sent |
| `superadmin` | signs promotions | Demo identity (one click) |

## Author

Esteban Fuster Pozzi (@estebanrfp) - Full Stack JavaScript Developer

## License

MIT
