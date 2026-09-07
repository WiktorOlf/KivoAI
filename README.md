# KivoAI

**KivoAI** is a privacy-first browser AI agent that navigates, inspects, and fills forms on webpages without exposing sensitive personal data to the AI model.

The core principle is simple: **privacy filtering and identity resolution happen locally inside the browser before and after the AI ever sees the data.**

KivoAI captures the visible page state, applies visual PII masking on an internal canvas, simplifies the DOM structure, downscales the payload for local VLM context budgets, and prompts a vision model (via Open WebUI / llama.cpp). When the model returns an action, the extension validates it, resolves symbolic identity tokens locally, and executes the action inside the browser tab.

---

## How It Works

```text
┌─────────────────────────────────────────────────────────────┐
│                         Webpage Tab                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      KivoAI Extension                       │
│                                                             │
│  • DOM Inspection & Interactive Element Indexing            │
│  • Sensitive Field & Password Detection                     │
│  • Visual Redaction (Off-screen Canvas Masking)             │
│  • Screenshot Resizing & Compression (≤ 1024px JPEG)        │
│  • Multi-Profile Symbolic Token Substitution                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Sanitized Frame + Indexed DOM
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Open WebUI API Layer                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Local Vision Model                      │
│            (e.g., Gemma 4 Vision via llama.cpp)             │
│                                                             │
│  • Reasoned Deliberation via "thought" property             │
│  • Emits Single Strict JSON Action or Markdown Answer       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Validated Structured Action
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Action Validator & Token Resolver              │
│                                                             │
│  • Validates against strict schema constraints              │
│  • Swaps {{tokens}} with active local profile data          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     DOM Action Executor                     │
│               (Clicks, Types, Selects, Keys)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. Autonomous Task Execution
Give the model a high-level goal (*"Sign in"*, *"Fill out shipping info with my saved profile"*, *"Search for documentation"*), and it executes sequential actions using real-time visual and structural feedback.

* **Deliberate Reasoning**: The model utilizes a `"thought"` property to assess form state and element coordinates before selecting an action.
* **Input-Preservation Guardrail**: If an input already contains text or shows `[FILLED]`, the agent is restricted from overwriting it with random data and instead prioritizes advancing or submitting the form.

### 2. Conversational Page Q&A ("Ask AI")
Ask natural-language questions (*"What is this page?"*, *"What documents are needed here?"*, *"Summarize this dashboard"*). The extension captures the page context and returns clean, rendered Markdown explanations without manipulating the DOM.

### 3. Zero-Exposure Multi-Profile Autofill
Browsers block extensions from reading native saved autofill data for security. KivoAI solves this with **symbolic template tokens**:
* Save multiple distinct identity profiles (*Personal*, *Work*, *Family*) directly in local browser storage.
* Fields include discrete **First**, **Middle**, and **Last Name** (auto-concatenated to `{{fullName}}`), **Username**, **Email**, **Phone**, and **Address**.
* The AI only ever sees and outputs abstract tokens like `{"action": "type", "text": "{{username}}"}`.
* The extension intercepts the token and injects the actual private string directly into the page input at the moment of execution. Real identities are never sent across the network.

---

## Privacy & Redaction Pipeline

### Visual Redaction
Visual information is essential for modern VLMs because dynamic web interfaces frequently obscure critical context from standard DOM trees. 

Before any screenshot is transmitted:
1. Coordinates of password inputs and sensitive form controls are mapped.
2. An off-screen canvas paints solid black redaction blocks over those coordinates.
3. The image is downscaled to a max dimension of 1024px and compressed to JPEG. This reduces network payload size from ~3.5MB to <90KB, preventing local VLM context window overflow.

### Sanitized DOM Indexing
The model does not receive the raw, noisy page DOM. Instead, it receives an indexed list of interactable controls:

```text
[1] <input> "Username" #user_login
[2] <input> "Password" [FILLED PASSWORD] #user_pass
[3] <button> "Sign In" #wp-submit
```

Sensitive values are replaced with `[REDACTED]` or `[FILLED]`, giving the model sufficient structural context without exposing credential contents.

---

## Permitted Action Schema

KivoAI treats all model output as **untrusted input**. The AI cannot execute arbitrary JavaScript. All responses must conform to the strict action schema:

```json
{
  "thought": "The login credentials appear already filled. I will click the Sign In button.",
  "action": "click",
  "index": 3
}
```

### Supported Actions

| Action | Parameters | Description |
| :--- | :--- | :--- |
| `click` | `index`, `target` | Dispatches pointer, mouse, and click events to elements or button wrappers. |
| `type` | `index`, `target`, `text` / `value`, `clearFirst` | Sets value across standard inputs, textareas, and `contenteditable` divs. Resolves `{{tokens}}`. |
| `select` | `index`, `target`, `value` | Selects matching options in standard HTML `<select>` elements. |
| `hover` | `index`, `target` | Fires mouseover/mouseenter events to expand dynamic menus. |
| `press_key` | `key` | Dispatches keyboard events (`Enter`, `Tab`, `Escape`, arrow keys). |
| `scroll` | `direction` (`up`/`down`), `amount` | Smoothly scrolls the window viewport by a specified pixel delta. |
| `wait` | `duration` | Pauses loop execution (100ms–10s) to allow asynchronous DOM hydration. |
| `navigate` | `path` | Client-side navigation restricted strictly to relative paths (`/`, `./`, `#`). |
| `answer` | `message` | Renders formatted conversational answers directly in the popup UI. |
| `finish` | `message` | Terminates the autonomous loop and reports task completion. |

---

## Installation

### Chrome / Brave / Edge (Chromium)
1. Clone or download this repository.
2. Navigate to `chrome://extensions/` and enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `client/extension` folder.

### Mozilla Firefox
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `client/extension/manifest.json`.

---

## Configuration

1. Click the **KivoAI** extension icon in your toolbar.
2. Click **Settings (⚙)** in the header.
3. Configure your local backend:
   * **Open WebUI Server URL**: e.g., `http://localhost:3000`
   * **API Key**: Optional (if authentication is enabled on your instance)
   * **Vision Model**: e.g., `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M`
   * **Step Limit**: Default `20` (supports up to `999`)
4. Click **Test** to confirm connectivity, then click **Save**.

---

## Known Browser Limitations

* **Automated Event Trust (`isTrusted`)**: Web browsers prohibit extension scripts from creating synthetic input events where `event.isTrusted === true`. Some enterprise bot detection services, CAPTCHA providers, and canvas-rendered web apps may reject programmatic interaction.
* **Native Autofill Databases**: Browsers strictly isolate saved credentials and credit cards from extension access. KivoAI bypasses this restriction securely via its built-in local tokenized profile manager.

---

## License

KivoAI is licensed under the **GNU General Public License v3.0**.

See the [`LICENSE`](LICENSE) file for details.
