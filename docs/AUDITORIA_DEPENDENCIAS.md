# Auditoria programada de dependências

**Revisado em 12/11/2026.** O repositório usa `npm audit` na CI e workflows separados para verificação de dependências, lockfile, licenças e cadeia de suprimentos.

- `.github/workflows/dependency-audit.yml`: auditoria programada e execução manual conforme o YAML.
- `.github/workflows/supply-chain.yml`: SBOM, verificação de licenças e inteligência OSV conforme eventos/filtros do workflow.
- `.github/dependabot.yml`: política de atualização automatizada, que pode gerar branches temporárias de PR.
- `scripts/check-lockfile-provenance.mjs`, `audit-licenses.mjs` e ferramentas auxiliares: verificações de integridade/licenças no escopo implementado.

Como a branch padrão é `prod`, agendamentos do GitHub Actions têm efeito a partir dos workflows dessa branch. **Os workflows já existem em `prod`**; não repetir o alerta histórico de 06/11 de que aguardavam um primeiro merge.

A existência da agenda não prova que a execução mais recente tenha terminado com sucesso. Consulte o histórico real de Actions antes de reportar resultado de varredura. Auditoria de licenças não substitui avaliação jurídica; SBOM e scanners conhecidos não identificam vulnerabilidades inéditas.

Referências: [Supply chain](SUPPLY_CHAIN_AUDIT.md), [CI econômica](CI_ECONOMICO.md), [Deploy](DEPLOY_OPERACAO.md).
