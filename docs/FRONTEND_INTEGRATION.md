# Frontend Chat Integration

Add this to your HTML page:

```html
<select id="agentSelect">
  <option value="auto">Auto</option>
  <option value="radiology">Radiology</option>
  <option value="neurology">Neurology</option>
  <option value="rehab">Rehab</option>
  <option value="medication">Medication</option>
</select>

<div id="chatOutput"></div>
<form id="chatForm">
  <input id="chatInput" placeholder="Ask the clinical agent..." />
  <button type="submit">Send</button>
</form>

<script type="module">
  import { attachChatForm } from './js/chatClient.js';
  attachChatForm({
    formId: 'chatForm',
    inputId: 'chatInput',
    outputId: 'chatOutput',
    agentSelectId: 'agentSelect'
  });
</script>
```

If your current app already has chat elements, change the IDs in `attachChatForm()`.
