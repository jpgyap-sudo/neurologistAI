export async function sendClinicalChat({ messages, agent = "auto", context = {} }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, agent, context })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.details || err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function attachChatForm({ formId, inputId, outputId, agentSelectId }) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  const agentSelect = agentSelectId ? document.getElementById(agentSelectId) : null;

  if (!form || !input || !output) {
    console.warn("Chat form elements not found.");
    return;
  }

  const messages = [];

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    messages.push({ role: "user", content: text });
    output.innerHTML += `<div class="user-message"><b>You:</b> ${escapeHtml(text)}</div>`;
    input.value = "";

    try {
      const data = await sendClinicalChat({
        messages,
        agent: agentSelect?.value || "auto",
        context: window.NEUROLOGIST_AI_CONTEXT || {}
      });
      messages.push({ role: "assistant", content: data.reply });
      output.innerHTML += `<div class="assistant-message"><b>${escapeHtml(data.agent)}:</b> ${escapeHtml(data.reply).replace(/\n/g, "<br>")}</div>`;
    } catch (err) {
      output.innerHTML += `<div class="error-message"><b>Error:</b> ${escapeHtml(err.message)}</div>`;
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
