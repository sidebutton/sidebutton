# Troubleshooting

Common issues and how to fix them.

## Server Issues

### Port 9876 already in use

```
Error: listen EADDRINUSE: address already in use :::9876
```

**Solution:**

```bash
# Find what's using the port
lsof -i :9876

# Kill the process
kill -9 <PID>

# Or use a different port (not yet supported)
```

### Server won't start

**Check Node.js version:**
```bash
node --version
# Requires Node.js 18+
```

**Check for missing dependencies:**
```bash
pnpm install
pnpm build
```

### "Command not found: sidebutton"

If globally installed but not found:

```bash
# Check npm bin path
npm bin -g

# Add to PATH if needed
export PATH="$PATH:$(npm bin -g)"
```

## Extension Issues

### Extension not connecting

1. **Is the server running?**
   ```bash
   curl http://localhost:9876/health
   ```

2. **Refresh the page** and click "Connect This Tab" again

3. **Check extension console:**
   - Right-click extension icon
   - Click "Inspect popup"
   - Check Console for errors

### "Connect This Tab" doesn't appear

- Make sure you're on a regular webpage (not `chrome://` pages)
- Check that Developer mode is enabled in `chrome://extensions/`
- Try reloading the extension

### Automation doesn't work on specific sites

Some sites block automation. Check:

1. **Content Security Policy** — Some sites block injected scripts
2. **Login state** — Some actions require authentication
3. **Selector validity** — Use `capture_page` to find correct selectors

### Extension disconnects frequently

This can happen if:
- The server restarts
- Chrome suspends the service worker
- Network issues

**Solution:** Click the extension icon and reconnect.

## Workflow Issues

### "Workflow not found"

```
Error: Workflow not found: my_workflow
```

**Check:**
1. Workflow file exists in `workflows/` or `actions/` directory
2. File has `.yaml` extension
3. `id` in YAML matches the requested ID

### "Browser not connected"

```
Error: BrowserNotConnected
```

**Solution:**
1. Install the [Chrome extension](/extension)
2. Navigate to a webpage
3. Click extension icon → "Connect This Tab"
4. Verify connection at [localhost:9876](http://localhost:9876)

### "Selector not found"

```
Error: Element not found: .my-selector
```

**Check:**
1. The selector is correct (use browser DevTools)
2. The element exists on the page
3. The page has fully loaded (add `browser.wait` step)

**Find correct selector:**
```bash
# Use the capture_page tool
curl -X POST http://localhost:9876/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"capture_page","arguments":{}}}'
```

### "OpenAI API key not configured"

```
Error: OpenAI API key not configured
```

**Solution:**

Set the environment variable:
```bash
export OPENAI_API_KEY=sk-your-key-here
npx @sidebutton/server serve
```

Or configure in Settings (dashboard).

### LLM step returns error

Common causes:
- Invalid API key
- Rate limiting
- Model not available

**Check:**
```bash
# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## MCP Issues

### Claude/Cursor doesn't see SideButton

1. **Check config file location:**
   - Claude Code: `~/.claude/settings.json`
   - Cursor: `~/.cursor/mcp.json`
   - VS Code: `.vscode/mcp.json`

2. **Verify JSON syntax** — Use a JSON validator

3. **Restart the AI tool** after config changes

4. **Check server is accessible:**
   ```bash
   curl http://localhost:9876/health
   ```

### "Server returned error"

```
MCP error -32603: ...
```

Common causes:
- Server not running
- Invalid parameters
- Browser not connected

**Debug:**
1. Check server logs (terminal where server is running)
2. Try the operation via dashboard first
3. Check run logs for details

### Tools not appearing in AI tool

1. Restart the AI tool
2. Check config URL is exactly `http://localhost:9876/mcp`
3. Verify server responds to tools/list:
   ```bash
   curl -X POST http://localhost:9876/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```

## Dashboard Issues

### Dashboard shows "Server Disconnected"

1. Check server is running
2. Refresh the page
3. Check browser console for errors (F12)

### Workflows don't appear

1. Check `workflows/` and `actions/` directories exist
2. Verify YAML files have correct structure
3. Check server logs for parsing errors

### Run log is empty

Run logs are stored in `run_logs/` directory. Check:
1. Directory exists and is writable
2. Workflows have been executed
3. Try running a workflow and check again

## Getting Help

If you can't resolve your issue:

1. **Check existing issues:** [GitHub Issues](https://github.com/sidebutton/sidebutton/issues)
2. **Search discussions:** [GitHub Discussions](https://github.com/sidebutton/sidebutton/discussions)
3. **Open a new issue** with:
   - Error message (full text)
   - Steps to reproduce
   - OS and Node.js version
   - Relevant logs

## Debug Mode

For more detailed logs, set the DEBUG environment variable:

```bash
DEBUG=* npx @sidebutton/server serve
```

This will show detailed information about:
- WebSocket connections
- Workflow execution
- MCP requests/responses
