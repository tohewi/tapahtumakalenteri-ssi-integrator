# Render Services List

This document shows the Render services available for the tapahtumakalenteri-ssi-integrator repository, retrieved using the Render MCP Server.

## Workspace Information

**Workspace:** Training Automation Tools  
**Owner ID:** tea-d62r4ucoud1c73d50qg0  
**Email:** tohewi@live.com  
**Type:** team

## Available Services

### 1. tapahtumakalenteri-ssi-integrator-1

**Service ID:** srv-d64fn0shg0os73d6cti0  
**Type:** web_service  
**Status:** Active (not_suspended)  
**Created:** 2026-02-08T21:09:24.262814Z  
**Last Updated:** 2026-02-09T07:22:56.3354Z

**Deployment Configuration:**
- **Branch:** main
- **Auto Deploy:** Yes (on commit)
- **Region:** frankfurt
- **Plan:** starter
- **Runtime:** node
- **Instances:** 1
- **URL:** https://tapahtumakalenteri-ssi-integrator-1.onrender.com
- **Dashboard:** https://dashboard.render.com/web/srv-d64fn0shg0os73d6cti0

**Build & Start:**
- **Build Command:** `cd scoring-ui && npm install && npm run build && cd ../scoring-proxy && npm install`
- **Start Command:** `cd scoring-proxy && node server.js`

**Additional Details:**
- SSH Address: srv-d64fn0shg0os73d6cti0@ssh.frankfurt.render.com
- IP Allow List: 0.0.0.0/0 (everywhere)
- Preview Environments: Off
- Pull Request Previews: No

---

### 2. tapahtumakalenteri-ssi-integrator

**Service ID:** srv-d62r8p0gjchc73bv7fvg  
**Type:** web_service  
**Status:** Active (not_suspended)  
**Created:** 2026-02-06T09:29:09.217878Z  
**Last Updated:** 2026-02-09T07:38:15.56598Z

**Deployment Configuration:**
- **Branch:** main
- **Auto Deploy:** Yes (on commit)
- **Region:** frankfurt
- **Plan:** starter
- **Runtime:** node
- **Instances:** 1
- **URL:** https://tapahtumakalenteri-ssi-integrator.onrender.com
- **Dashboard:** https://dashboard.render.com/web/srv-d62r8p0gjchc73bv7fvg

**Build & Start:**
- **Build Command:** `cd scoring-ui && npm install && npm run build && cd ../scoring-proxy && npm install`
- **Start Command:** `cd scoring-proxy && node server.js`

**Additional Details:**
- SSH Address: srv-d62r8p0gjchc73bv7fvg@ssh.frankfurt.render.com
- IP Allow List: 0.0.0.0/0 (everywhere)
- Preview Environments: Off
- Pull Request Previews: No

---

## Summary

The repository has **2 active web services** deployed on Render:

1. **tapahtumakalenteri-ssi-integrator-1** (newer, created Feb 8, 2026)
2. **tapahtumakalenteri-ssi-integrator** (older, created Feb 6, 2026)

Both services:
- Run on the `main` branch
- Auto-deploy on commits
- Use the same build and start commands
- Are hosted in the Frankfurt region
- Run on the Starter plan with 1 instance each
- Are publicly accessible (0.0.0.0/0)

## Using the Render MCP Server

The Render MCP server provides tools to interact with Render services programmatically:

### Available Tools

- `render-list_workspaces` - List available workspaces
- `render-get_selected_workspace` - Get the currently selected workspace
- `render-select_workspace` - Select a workspace (requires ownerID)
- `render-list_services` - List all services in the selected workspace
- `render-get_service` - Get details about a specific service (requires serviceId)
- `render-list_deploys` - List deployments for a service (requires serviceId)
- `render-get_deploy` - Get details about a specific deployment
- `render-get_metrics` - Get performance metrics for a service

### Example Usage

```javascript
// Note: These are MCP server tool calls, not direct JavaScript functions
// The actual syntax depends on your MCP client implementation

// List workspaces
render.list_workspaces()

// List all services in the workspace
render.list_services()

// Get details about a specific service
render.get_service({ serviceId: 'srv-d62r8p0gjchc73bv7fvg' })

// List recent deployments
render.list_deploys({ serviceId: 'srv-d62r8p0gjchc73bv7fvg' })
```
