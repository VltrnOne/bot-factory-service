const express = require('express');
const { Client } = require('kubernetes-client');
const AJV = require('ajv');
require('dotenv').config();

const app = express();
const ajv = new AJV();
const personaSchema = require('../config/persona-template.schema.json');
const validate = ajv.compile(personaSchema);

// API to create a bot instance
app.post('/bots', express.json(), async (req, res) => {
  const template = req.body;
  const valid = validate(template);
  if (!valid) return res.status(400).json({errors: validate.errors});

  // Instantiate Kubernetes Deployment
  const client = new Client({ version: '1.13' });
  const deploymentManifest = require('./deployment-template.json');
  deploymentManifest.metadata.name = `bot-${template.id}`;
  deploymentManifest.spec.template.spec.containers[0].env = [
    { name: 'PERSONA_CONFIG', value: JSON.stringify(template) }
  ];
  try {
    await client.apis.apps.v1.namespaces(process.env.NAMESPACE).deployments.post({ body: deploymentManifest });
    res.status(201).json({ message: 'Bot instance created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot Factory running on port ${port}`));
