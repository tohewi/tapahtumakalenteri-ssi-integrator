#!/usr/bin/env node

/**
 * List Render Services
 * 
 * This script demonstrates how to use the Render MCP server tools to list
 * services programmatically. Note: This script is for documentation purposes
 * and demonstrates the MCP tool calls. The actual MCP server integration is
 * handled by the development environment.
 * 
 * Usage:
 *   node scripts/list-render-services.js
 */

console.log('📋 Listing Render Services using MCP Server\n');
console.log('=' .repeat(60));

console.log('\n🔍 Step 1: List Workspaces');
console.log('   Tool: render-list_workspaces');
console.log('   Purpose: Find available workspaces to work with');

console.log('\n🔍 Step 2: Get Selected Workspace');
console.log('   Tool: render-get_selected_workspace');
console.log('   Purpose: Verify which workspace is currently active');

console.log('\n🔍 Step 3: List Services');
console.log('   Tool: render-list_services');
console.log('   Purpose: Retrieve all services in the selected workspace');

console.log('\n🔍 Step 4: Get Service Details');
console.log('   Tool: render-get_service');
console.log('   Purpose: Fetch detailed information about specific services');

console.log('\n' + '=' .repeat(60));
console.log('\n✅ MCP Server Tools Documentation:\n');

const tools = [
  {
    name: 'render-list_workspaces',
    description: 'List the workspaces that you have access to',
    params: 'None'
  },
  {
    name: 'render-get_selected_workspace',
    description: 'Get the currently selected workspace',
    params: 'None'
  },
  {
    name: 'render-select_workspace',
    description: 'Select a workspace to use for all actions',
    params: 'ownerID (string)'
  },
  {
    name: 'render-list_services',
    description: 'List all services in your Render account',
    params: 'includePreviews (boolean, optional)'
  },
  {
    name: 'render-get_service',
    description: 'Get details about a specific service',
    params: 'serviceId (string)'
  },
  {
    name: 'render-list_deploys',
    description: 'List deploys matching the provided filters',
    params: 'serviceId (string), cursor (string), limit (number)'
  },
  {
    name: 'render-get_deploy',
    description: 'Retrieve the details of a particular deploy',
    params: 'serviceId (string), deployId (string)'
  },
  {
    name: 'render-get_metrics',
    description: 'Get performance metrics for any Render resource',
    params: 'resourceId (string), metricTypes (array), startTime, endTime, etc.'
  },
  {
    name: 'render-list_postgres_instances',
    description: 'List all Postgres databases in your Render account',
    params: 'None'
  },
  {
    name: 'render-get_postgres',
    description: 'Retrieve a Postgres instance by ID',
    params: 'postgresId (string)'
  }
];

tools.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.name}`);
  console.log(`   Description: ${tool.description}`);
  console.log(`   Parameters: ${tool.params}`);
  console.log();
});

console.log('=' .repeat(60));
console.log('\n📚 For detailed service information, see: docs/render-services.md');
console.log('\n✨ The Render MCP server provides programmatic access to:');
console.log('   • Service management and monitoring');
console.log('   • Deployment history and status');
console.log('   • Performance metrics (CPU, memory, HTTP)');
console.log('   • Database instance information');
console.log('   • Log retrieval and analysis');
console.log();
