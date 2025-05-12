# dGroup / Distributed Chat Application with GraphDB

This project is a real-time chat application built entirely on the frontend, utilizing **GraphDB (gdb-p2p)** as its decentralized database engine. It demonstrates how `gdb-p2p`'s features facilitate the creation of collaborative, P2P applications with data persistence and real-time synchronization.

## Key Chat Features (Powered by GraphDB)

1.  **Real-time and Persistent Messaging:**
    *   **GraphDB:** `db.put()` is used to store each message as a node in the graph.
    *   **GraphDB:** `db.map({ realtime: true, field: 'timestamp', order: 'asc' })` subscribes to all messages. New messages (`'added'`), updates (`'updated'`), and deletions (`'removed'`) are instantly reflected across all connected instances.
    *   Messages persist locally thanks to `gdb-p2p`'s storage and are synchronized with other peers.

2.  **Automatic P2P Synchronization:**
    *   **GraphDB:** The P2P nature of `gdb-p2p` allows multiple browser windows (or even different browsers/devices on the same network, depending on `gdb-p2p`'s peer connection capabilities) to share and synchronize the chat state without a central server. New messages appear in all connected instances.

3.  **Chat History and Progressive Loading:**
    *   **GraphDB:** All messages are stored with a `timestamp`. The initial `db.map()` query with `order: 'asc'` retrieves the history.
    *   The application implements "load older messages" by querying and displaying portions of the locally maintained message array (populated by `gdb-p2p`).

4.  **User Identification and Message Styling:**
    *   **Application:** The username is saved in `localStorage`.
    *   **GraphDB:** Messages store a `sender` field.
    *   The UI differentiates the user's own messages from others by comparing the message's `sender` with the application's `currentUser`.

5.  **"Recent Messages" Panel:**
    *   **GraphDB:** A second `db.map({ realtime: true, field: 'timestamp', order: 'desc', $limit: 5 })` subscription is used to dynamically fetch and keep the 5 most recent messages updated in a side panel.

6.  **Chat Participants List:**
    *   **Application:** A `Set` of unique `sender` names is maintained, extracted from messages received via `db.map()`.
    *   This shows who has participated, derived directly from the data stored and synchronized by `gdb-p2p`.

7.  **Text and Image Sending:**
    *   **GraphDB:** Message nodes can store complex objects in their `content`, allowing for both text (`{type: 'text', value: '...'}`) and DataURL images (`{type: 'image', value: 'data:...'}`).

8.  **Message Search (Client-Side):**
    *   **Application:** Filtering is performed on the local array of messages (populated by `gdb-p2p`) to search by text or sender. Deeper search functionality could be extended to query `gdb-p2p` directly.

9.  **Themes (Light/Dark):**
    *   A UI feature, not directly dependent on GraphDB, but complements the user experience.

## GraphDB Capabilities Demonstrated

*   **Flexible Node Storage:** Ability to save diverse data types (text messages, image references) as nodes.
*   **Real-time Queries (`db.map`):** Fundamental to the chat's dynamic nature, allowing the UI to react instantly to database changes.
*   **Query Sorting and Limiting:** Used for history (`order: 'asc'`) and the recent messages panel (`order: 'desc', $limit: N`).
*   **P2P Synchronization:** The core enabler for serverless, multi-instance chat functionality.
*   **Local Persistence:** Ensures messages are not lost when closing and reopening the browser (within the same browser instance/profile).
*   **Data Event Handling (`initial`, `added`, `updated`, `removed`):** Provides the necessary hooks to update the user interface granularly.

This example illustrates how `gdb-p2p` can be a solid and efficient foundation for building decentralized, real-time collaborative web applications with relative simplicity.

[dGroup Demo](https://estebanrfp.github.io/dGroup/) Powered by [GraphDB (GDB)](https://github.com/estebanrfp/gdb)

-------------

#### Credits
[by Esteban Fuster Pozzi (estebanrfp)](https://github.com/estebanrfp)
