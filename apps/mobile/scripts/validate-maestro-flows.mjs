import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const flowsDirectory = join(root, '.maestro');
const expectedFlows = new Map([
  ['critical-parent-flow.yaml', ['Paiements', 'Profil', 'Solde familial à régler']],
  ['login-parent.yaml', ['login-phone', 'login-password', 'Solde familial à régler']],
  ['association-enfant.yaml', ['association-code', 'Associer un enfant', 'Demande manuelle']],
  [
    'preparation-paiement.yaml',
    ['payment-amount', 'payment-provider-ORANGE_MONEY', 'Paiement des frais'],
  ],
  [
    'consultation-scolarite.yaml',
    ['child-results', 'results-tab-grades', 'results-tab-attendance', 'Scolarité'],
  ],
]);

const files = (await readdir(flowsDirectory)).filter((file) => file.endsWith('.yaml')).sort();
const failures = [];

for (const [file, markers] of expectedFlows) {
  if (!files.includes(file)) {
    failures.push(`${file} est absent`);
    continue;
  }

  const source = await readFile(join(flowsDirectory, file), 'utf8');
  for (const required of ['appId: cm.cplan.app', 'launchApp:', 'assertVisible:']) {
    if (!source.includes(required)) failures.push(`${file} ne contient pas ${required}`);
  }
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${file} ne couvre pas ${marker}`);
  }
  if (!source.includes('${PARENT_PHONE}') || !source.includes('${PARENT_PASSWORD}')) {
    failures.push(`${file} doit recevoir les identifiants parent par variables Maestro`);
  }
  if (/CSBNoutchaDemo|SchoolFeesDemo/.test(source)) {
    failures.push(`${file} contient un mot de passe en clair`);
  }
}

if (files.length !== expectedFlows.size) {
  failures.push(`${files.length} flux trouvés au lieu de ${expectedFlows.size}`);
}

if (failures.length) {
  console.error(`Validation Maestro échouée:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Maestro : ${files.length} flux critiques valides (connexion, association, paiement sans transaction, scolarité).`,
  );
}
