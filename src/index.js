// force Node to try IPv4 before IPv6
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

// — the rest of your imports and code follow here…
import express from 'express';
import bodyParser from 'body-parser';
// etc…

const express = require('express');
const k8s = require('@kubernetes/client-node');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { Pool } = require('pg');

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const K8S_NAMESPACE = 'marketing-bots';

// --- Database Setup ---
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
dbPool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

// --- Schema Validation Setup ---
const ajv = new Ajv();
const botSchemaPath = path.join(__dirname, '..', 'config', 'bot-schema.json');
const botSchema = JSON.parse(fs.readFileSync(botSchemaPath, 'utf8'));
const validateBot = ajv.compile(botSchema);

// --- Kubernetes Client Setup ---
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

// --- Express App Setup ---
const app = express();
app.use(express.json());

// --- Helper Functions ---
function getTimestamp() {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear().toString().slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function createDeploymentManifest(persona) {
  const deploymentName = `vltrn-${persona.function.toLowerCase()}-${getTimestamp()}`;
  const manifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: deploymentName, labels: { app: 'vltrn-bot', function: persona.function } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { 'app.kubernetes.io/instance': deploymentName } },
      template: {
        metadata: { labels: { 'app.kubernetes.io/instance': deploymentName } },
        spec: {
          containers: [{
            name: 'bot-container',
            image: 'nginx:latest',
            ports: [{ containerPort: 80 }],
            env: [
              { name: 'VLTRN_FUNCTION', value: persona.function },
              { name: 'VLTRN_TONE', value: persona.tone },
              { name: 'VLTRN_ID', value: persona.id },
              { name: 'VLTRN_NAME', value: persona.name }
            ]
          }]
        }
      }
    }
  };
  return manifest;
}

// --- API Endpoints ---

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

app.post('/bots', async (req, res) => {
  if (!validateBot(req.body)) {
    return res.status(400).json({ error: 'Invalid persona data', details: validateBot.errors });
  }
  try {
    const deploymentManifest = createDeploymentManifest(req.body);
    const deploymentName = deploymentManifest.metadata.name;
    await k8sAppsApi.createNamespacedDeployment(K8S_NAMESPACE, deploymentManifest);
    const dbClient = await dbPool.connect();
    try {
      await dbClient.query('INSERT INTO deployments(name, persona_function, status) VALUES($1, $2, $3)', [deploymentName, req.body.function, 'Provisioning']);
    } finally {
      dbClient.release();
    }
    res.status(201).json({ message: 'Bot deployment initiated successfully.', deploymentName });
  } catch (error) {
    console.error('Failed to create deployment:', error);
    res.status(500).json({ error: 'Failed to create bot deployment.', details: error.message });
  }
});

app.get('/bots', async (req, res) => {
  const dbClient = await dbPool.connect();
  try {
    const { rows } = await dbClient.query('SELECT name, status, created_at FROM deployments ORDER BY created_at DESC');
    res.status(200).json({ bots: rows });
  } catch (error) {
    console.error('Failed to retrieve bots:', error);
    res.status(500).json({ error: 'Failed to retrieve bots.' });
  } finally {
    dbClient.release();
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`VLTRN Bot Factory v5.0 listening on port ${PORT}`);
});