# Auditoria programada de dependências

O CI da branch dev já verifica vulnerabilidades e licenças por push.
O workflow dependency-audit.yml acrescenta verificação programada semanal
de hashes do lockfile, origem de pacotes, npm audit e inventário de licenças.

**Importante:** a branch padrão é prod. O GitHub Actions só agenda cron
em workflows existentes nessa branch; portanto, esta agenda criada na dev
não está ativa antes de um merge aprovado. Nenhum merge será feito aqui.

O inventário de licenças é informativo e não substitui exame jurídico.
A verificação de dependências não substitui análise de segurança dos EPUBs.
