// Script de vérification UNIQUEMENT (ne fait pas partie du produit livré) :
// génère les CREATE TABLE à partir du DMMF du client Prisma déjà généré,
// pour pouvoir démarrer une vraie base Postgres et faire tourner l'app de
// bout en bout dans un environnement où `prisma migrate`/`db push` ne
// peuvent pas s'exécuter (nécessitent le vrai moteur natif schema-engine,
// qui a besoin de dialoguer avec Postgres, contrairement à `generate`).
const { Prisma } = require('@prisma/client');

const SCALAR_TO_PG = {
  String: 'TEXT',
  Int: 'INTEGER',
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP(3)',
  Json: 'JSONB',
};

const dmmf = Prisma.dmmf.datamodel;
const enumNames = new Set(dmmf.enums.map((e) => e.name));

let sql = '';
const deferredFks = [];

for (const en of dmmf.enums) {
  sql += `CREATE TYPE "${en.name}" AS ENUM (${en.values.map((v) => `'${v.name}'`).join(', ')});\n`;
}

for (const model of dmmf.models) {
  const table = model.dbName || model.name;
  const cols = [];
  const fks = [];

  for (const field of model.fields) {
    if (field.kind === 'object') {
      // Relation N-1 sans FK propre (déjà couverte par le scalar field
      // correspondant, ex. sellerId) : rien à faire ici. Les relations 1-N
      // n'ont pas de colonne côté "1".
      continue;
    }
    if (field.isList) continue;

    const dbName = field.dbName || field.name;
    let type;
    if (field.kind === 'enum') type = `"${field.type}"`;
    else type = SCALAR_TO_PG[field.type] || 'TEXT';

    const nullable = field.isRequired ? 'NOT NULL' : '';
    const isStringLikeDefault = field.kind === 'enum' || field.type === 'String';
    const def = field.hasDefaultValue && field.default?.name === 'uuid' ? 'DEFAULT gen_random_uuid()' :
                field.hasDefaultValue && field.default?.name === 'now' ? 'DEFAULT now()' :
                field.hasDefaultValue && typeof field.default !== 'object' && isStringLikeDefault ? `DEFAULT '${field.default}'` :
                field.hasDefaultValue && typeof field.default !== 'object' ? `DEFAULT ${JSON.stringify(field.default)}` : '';

    cols.push(`  "${dbName}" ${type} ${nullable} ${def}`.trim());
  }

  // Clés étrangères : dérivées des relations Prisma (relationFromFields).
  for (const field of model.fields) {
    if (field.kind === 'object' && field.relationFromFields?.length) {
      const relatedModel = dmmf.models.find((m) => m.name === field.type);
      const targetTable = relatedModel?.dbName || field.type;
      field.relationFromFields.forEach((fromField, i) => {
        const toField = field.relationToFields[i];
        const localCol = model.fields.find((f) => f.name === fromField)?.dbName || fromField;
        const targetCol = relatedModel?.fields.find((f) => f.name === toField)?.dbName || toField;
        fks.push(`  FOREIGN KEY ("${localCol}") REFERENCES "${targetTable}"("${targetCol}")`);
      });
    }
  }

  const pk = model.fields.find((f) => f.isId);
  const pkCol = pk ? pk.dbName || pk.name : null;

  // Les FK sont ajoutées après coup (ALTER TABLE, plus bas) pour ne pas
  // dépendre de l'ordre de création des tables entre elles.
  sql += `CREATE TABLE "${table}" (\n${[...cols, pk ? `  PRIMARY KEY ("${pkCol}")` : null].filter(Boolean).join(',\n')}\n);\n\n`;
  for (const fk of fks) {
    deferredFks.push(`ALTER TABLE "${table}" ADD ${fk.trim()};`);
  }
}

sql += deferredFks.join('\n') + '\n\n';

// Contraintes uniques (dont composites, ex. Conversation.@@unique).
for (const model of dmmf.models) {
  const table = model.dbName || model.name;
  for (const idx of model.uniqueIndexes || []) {
    const cols = idx.fields.map((f) => {
      const field = model.fields.find((fl) => fl.name === f);
      return `"${field?.dbName || f}"`;
    });
    sql += `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${idx.name || idx.fields.join('_')}_key" UNIQUE (${cols.join(', ')});\n`;
  }
  const uniqueFields = model.fields.filter((f) => f.isUnique);
  for (const f of uniqueFields) {
    sql += `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${f.dbName || f.name}_key" UNIQUE ("${f.dbName || f.name}");\n`;
  }
}

sql = 'CREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n' + sql;

require('fs').writeFileSync(process.argv[2] || 'ddl.sql', sql);
console.log('DDL écrit dans', process.argv[2] || 'ddl.sql');
