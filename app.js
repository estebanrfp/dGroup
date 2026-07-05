// dGroup — a P2P group chat on GenosDB with engine-powered full-text search.
//
// What this example demonstrates, end to end:
//   • Signed messages (like dChat) PLUS the query engine at work: full-text
//     search runs through the engine's $text operator — accent-folding,
//     field-level — and any sender can be filtered with one click.
//   • A "recent activity" sidebar widget driven by a second live subscription
//     with $limit: the engine manages the realtime window itself.
//   • Zero-trust + Governance: guest reads → member chats (~10 s) →
//     moderator deletes any message (10 messages sent).
//   • GenosDB Design Guide patterns: tokens (dark), identity in a centered
//     <dialog>, session top-right as `0x… [role]`, toasts.
import { gdb } from "https://cdn.jsdelivr.net/npm/genosdb@latest/dist/index.min.js"

// ============================== Configuration ==============================

const DB_NAME = "dgroup" // database name = P2P room name

// Demo superadmin — SHOWCASE ONLY (public mnemonic). Replace for real use.
const DEMO_SUPERADMIN = {
  address: "0xbfDe0eCEC5332Fd86D2570085571D6051Df098dA",
  mnemonic: "panic now afford carbon donate lecture drift excite collect essay stuff prosper",
}

const ROLES = {
  superadmin: { can: ["assignRole"], inherits: ["moderator"] }, // signs promotions
  moderator: { can: ["delete", "deleteAny"], inherits: ["member"] }, // cleans up
  member: { can: ["write", "link", "sync"], inherits: ["guest"] }, // chats
  guest: { can: ["read", "sync"] }, // reads only
}

const MEMBER = { $in: ["member", "moderator"] }
const GOVERNANCE_RULES = [
  { if: { role: "guest" }, offsetTimestamp: 10000, then: { assignRole: "member" } }, // onboarding gate
  { if: { role: MEMBER }, then: { assignRole: "member" } }, // floor
  { if: { role: MEMBER, messagesSent: { $gte: 10 } }, then: { assignRole: "moderator" } }, // climb
]

// ================================ Database =================================

const db = await gdb(DB_NAME, {
  rtc: true, // required by the Security Manager
  sm: {
    superAdmins: [DEMO_SUPERADMIN.address],
    customRoles: ROLES,
    governanceRules: GOVERNANCE_RULES,
    acls: true, // each message is owned by its author
  },
})
globalThis.db = db // console handle (matches the official examples)

// ================================ Helpers ==================================

const $ = (id) => document.getElementById(id)

const toast = (msg, isError = false) => {
  const el = $("toast")
  el.textContent = msg
  el.className = `toast show${isError ? " error" : ""}`
  clearTimeout(toast._t)
  toast._t = setTimeout(() => (el.className = "toast"), 3200)
}

// =============================== Identity ==================================

let myAddress = null
let myRole = null
let myName = null
let unsubRole = null

const can = (permission) => {
  let role = myRole
  while (role && ROLES[role]) {
    if (ROLES[role].can.includes(permission)) return true
    role = ROLES[role].inherits?.[0]
  }
  return false
}

const applyPermissionsToUI = () => {
  const writable = can("write")
  $("what").disabled = !writable
  $("sendBtn").disabled = !writable
  $("what").placeholder = writable ? "Message the group…"
    : myAddress ? "Your member role is on its way (~10 s while a superadmin is online)…"
    : "Sign in (top right) to chat — reading is free."
  refreshDeleteButtons()
}

db.sm.setSecurityStateChangeCallback((state) => {
  if (state.isActive) {
    myAddress = state.activeAddress
    $("identityModal").close()
    $("identityPanel").style.display = "none"
    $("sessionBar").style.display = "flex"
    $("whoami").textContent = state.abbrAddr
    watchMyRole()
  } else {
    unsubRole?.(); unsubRole = null
    myAddress = myRole = myName = null
    $("sessionBar").style.display = "none"
    $("identityPanel").style.display = "block"
    $("mnemonicBox").readOnly = false
    $("generateBtn").style.display = "inline-block"
    $("protectBtn").style.display = "none"
    $("webauthnLoginBtn").style.display = db.sm.hasExistingWebAuthnRegistration() ? "inline-block" : "none"
    queueMicrotask(() => applyPermissionsToUI())
  }
})

const watchMyRole = async () => {
  unsubRole?.()
  const { unsubscribe } = await db.get(`user:${myAddress}`, (node) => {
    const nextRole = node?.value?.role ?? "guest"
    myName = node?.value?.displayName ?? null
    $("nameInput").value = myName ?? ""
    if (nextRole !== myRole) {
      myRole = nextRole
      $("myRole").textContent = myRole
      $("myRole").dataset.role = myRole
      applyPermissionsToUI()
    }
  })
  unsubRole = unsubscribe
}

$("nameInput").addEventListener("change", async () => {
  const name = $("nameInput").value.trim().slice(0, 24)
  if (!myAddress || !name || name === myName) return
  const id = `user:${myAddress}`
  const { result } = await db.get(id)
  await db.put({ ...result.value, displayName: name }, id) // spread keeps `role`!
  toast(`You are now "${name}"`)
})

// --- Identity modal (three-phase state machine, see the Design Guide) ---

$("openLoginBtn").onclick = () => $("identityModal").showModal()
$("closeModalBtn").onclick = () => $("identityModal").close()
$("identityModal").onclick = (e) => { if (e.target === $("identityModal")) $("identityModal").close() }

$("generateBtn").onclick = async () => {
  const identity = await db.sm.startNewUserRegistration()
  if (!identity) return toast("Could not generate an identity", true)
  const box = $("mnemonicBox")
  box.value = identity.mnemonic
  box.readOnly = true
  $("generateBtn").style.display = "none"
  $("protectBtn").style.display = "inline-block"
  toast("SAVE THIS PHRASE — it is your only way back into this identity")
}

$("copyBtn").onclick = async () => {
  const phrase = $("mnemonicBox").value.trim()
  if (!phrase) return
  await navigator.clipboard.writeText(phrase)
  toast("Phrase copied to clipboard")
}

$("loginBtn").onclick = async () => {
  const phrase = $("mnemonicBox").value.trim()
  if (!phrase) return toast("Paste (or generate) a mnemonic first", true)
  const identity = await db.sm.loginOrRecoverUserWithMnemonic(phrase)
  identity ? toast(`Welcome ${db.sm.abbrAddr(identity.address)}`) : toast("Login failed", true)
}

$("protectBtn").onclick = async () => {
  const address = await db.sm.protectCurrentIdentityWithWebAuthn()
  address ? toast("Identity protected with a passkey") : toast("Passkey protection failed (HTTPS required)", true)
}

$("webauthnLoginBtn").onclick = async () => {
  const address = await db.sm.loginCurrentUserWithWebAuthn()
  if (!address) toast("Passkey login failed", true)
}

$("superadminBtn").onclick = () => db.sm.loginOrRecoverUserWithMnemonic(DEMO_SUPERADMIN.mnemonic)
$("logoutBtn").onclick = () => db.sm.clearSecurity()

// =========================== Live feed (default) ===========================

const list = $("messagesList")
let scrollTimer = null
let searchMode = false

const scrollToBottom = (force = false) => {
  if (force || list.scrollHeight - list.clientHeight <= list.scrollTop + 150) {
    list.scrollTop = list.scrollHeight
  }
}

const buildMessage = (id, m) => {
  const mine = myAddress && m.sender === myAddress
  const li = document.createElement("li")
  li.id = `msg-${id}`
  li.className = `message ${mine ? "mine" : "other"}`
  li.dataset.sender = m.sender ?? ""

  const head = document.createElement("div")
  head.className = "message-head"
  const name = document.createElement("button")
  name.className = "message-name"
  name.textContent = m.senderName || "anonymous"
  name.title = "Show only this sender's messages"
  name.onclick = () => filterBySender(m.sender, m.senderName)
  const addr = document.createElement("span")
  addr.className = "message-addr"
  addr.textContent = m.sender ? db.sm.abbrAddr(m.sender) : "unsigned"
  head.append(name, addr)

  const del = document.createElement("button")
  del.className = "message-delete"
  del.textContent = "×"
  del.title = "Delete message"
  del.onclick = () => deleteMessage(id)
  head.appendChild(del)

  const body = document.createElement("div")
  body.className = "message-body"
  body.textContent = m.text ?? "" // textContent: XSS-safe by design

  const time = document.createElement("span")
  time.className = "message-time"
  time.textContent = new Date(m.timestamp).toLocaleString()

  li.append(head, body, time)
  return li
}

const refreshDeleteButtons = () => {
  for (const li of list.querySelectorAll(".message")) {
    const mine = myAddress && li.dataset.sender === myAddress
    li.classList.toggle("can-delete", Boolean((mine && can("delete")) || can("deleteAny")))
    li.classList.toggle("mine", mine)
    li.classList.toggle("other", !mine)
  }
}

// Live subscription — paused (ignored) while a search snapshot is on screen.
db.map({ query: { type: "message" }, field: "timestamp", order: "asc" }, ({ id, value, action }) => {
  if (searchMode) return
  const existing = document.getElementById(`msg-${id}`)
  switch (action) {
    case "initial":
    case "added": // chat flows downward: sorted arrival appends
      if (!existing) list.appendChild(buildMessage(id, value))
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => scrollToBottom(action === "initial"), 50)
      break
    case "updated":
      existing?.replaceWith(buildMessage(id, value))
      break
    case "removed":
      existing?.remove()
      break
  }
  refreshDeleteButtons()
})

// Recent activity widget — a SECOND live subscription with $limit: the
// engine manages the realtime window (newest five), emitting `removed`
// for the message that falls out when a newer one arrives.
const recent = $("recentList")
const buildRecentItem = (id, m) => {
  const li = document.createElement("li")
  li.dataset.id = id
  li.innerHTML = `<strong></strong><span></span>`
  li.querySelector("strong").textContent = m.senderName || "anonymous"
  li.querySelector("span").textContent = (m.text ?? "").slice(0, 42)
  return li
}

db.map({ query: { type: "message" }, field: "timestamp", order: "desc", $limit: 5 }, ({ id, value, action }) => {
  const existing = recent.querySelector(`[data-id="${CSS.escape(id)}"]`)
  switch (action) {
    case "initial":
      recent.appendChild(buildRecentItem(id, value))
      break
    case "added":
      recent.prepend(buildRecentItem(id, value))
      break
    case "updated":
      existing?.replaceWith(buildRecentItem(id, value))
      break
    case "removed": // also fired when a message falls OUT of the $limit window
      existing?.remove()
      break
  }
})

const deleteMessage = async (id) => {
  try {
    await db.sm.executeWithPermission("delete")
    await db.remove(id)
  } catch (err) {
    toast(err.message, true)
  }
}

// ========================= Search ($text) & filters ========================
// Search is a STATIC engine query — $text is field-level and accent-folding.
// The live feed pauses while a snapshot is on screen; Clear resumes it.

const enterSearchMode = (title) => {
  searchMode = true
  list.innerHTML = ""
  $("searchBanner").style.display = "flex"
  $("searchLabel").textContent = title
}

const exitSearchMode = async () => {
  searchMode = false
  $("searchBanner").style.display = "none"
  $("searchInput").value = ""
  list.innerHTML = ""
  // Repaint from a fresh static read; the live subscription resumes deltas.
  const { results } = await db.map({ query: { type: "message" }, field: "timestamp", order: "asc" })
  results.forEach((n) => list.appendChild(buildMessage(n.id, n.value)))
  refreshDeleteButtons()
  scrollToBottom(true)
}

$("clearSearchBtn").onclick = () => exitSearchMode()

$("searchForm").onsubmit = async (e) => {
  e.preventDefault()
  const term = $("searchInput").value.trim()
  if (!term) return exitSearchMode()
  // Full-text search through the ENGINE — not a client-side filter.
  const { results } = await db.map({
    query: { type: "message", text: { $text: term } },
    field: "timestamp", order: "asc",
  })
  enterSearchMode(`${results.length} result${results.length === 1 ? "" : "s"} for “${term}”`)
  results.forEach((n) => list.appendChild(buildMessage(n.id, n.value)))
  refreshDeleteButtons()
}

const filterBySender = async (sender, senderName) => {
  if (!sender) return
  const { results } = await db.map({
    query: { type: "message", sender }, // exact-match filter on the signer
    field: "timestamp", order: "asc",
  })
  enterSearchMode(`${results.length} message${results.length === 1 ? "" : "s"} by ${senderName || db.sm.abbrAddr(sender)}`)
  results.forEach((n) => list.appendChild(buildMessage(n.id, n.value)))
  refreshDeleteButtons()
}

// ============================== Composer ===================================

$("messageForm").onsubmit = async (e) => {
  e.preventDefault()
  const text = $("what").value.trim()
  if (!text) return
  try {
    await db.sm.executeWithPermission("write") // chatting is an earned right
    const name = $("nameInput").value.trim().slice(0, 24) || "anonymous"
    await db.sm.acls.set({ type: "message", text, sender: myAddress, senderName: name, timestamp: Date.now() })
    await bumpMessagesSent()
    $("what").value = ""
    $("what").focus()
  } catch (err) {
    toast(err.message, true)
  }
}

const bumpMessagesSent = async () => {
  const id = `user:${myAddress}`
  const { result } = await db.get(id)
  await db.put({ ...result.value, messagesSent: (result.value.messagesSent ?? 0) + 1 }, id)
}

// ================================= Boot ====================================

applyPermissionsToUI()
addEventListener("beforeunload", () => db.room?.leave?.()) // real unload only — never pagehide
