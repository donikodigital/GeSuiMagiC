//backend/jest.config.js
// Config Jest pour les tests unitaires (tous les fichiers *.spec.ts sous src).
// NB : ne jamais ecrire un glob avec "**" suivi de "/" dans un commentaire bloc,
// la sequence ferme le commentaire et casse le fichier (c'etait le cas avant).
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};
