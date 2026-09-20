# Store metadata

This file records Chrome Web Store material for a future release. Complete the
listing, screenshots, reviewer instructions, and privacy policy before store
submission.

## Listing

- Name: API Starter Kit AI Assistant
- Summary: Open the AI assistant from Chrome's side panel.
- Description: Open the API Starter Kit AI assistant in Chrome's side panel.
- Category: TODO choose the appropriate store category.
- Screenshots: TODO add current Chrome Web Store screenshots.

## Privacy and data use

The extension sends sign-in requests and conversation content to the API server
the user configures. Authentication, authorization, conversation persistence,
and AI processing remain on that server. The extension stores the selected API
origin and the existing assistant client's bearer token in its own extension
origin storage. It does not read or transmit active-page content.

## Chrome Web Store

### Single purpose

Provide a Chrome side-panel entry point for the API Starter Kit AI assistant.

### Permissions justification

- `sidePanel`: display the extension UI in Chrome's side panel.
- `optional_host_permissions`: request access to the configured API server only
  when the user connects. Remote hosts require HTTPS; HTTP is accepted by the
  connection form only for loopback development servers.

The extension does not request `activeTab`, `tabs`, or content-script access.

### Release notes

TODO write user-facing release notes after the first usable release.
