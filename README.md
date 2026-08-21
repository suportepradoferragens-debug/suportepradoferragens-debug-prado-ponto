# Prado Ponto — MVP

Protótipo funcional de ponto por presença física.

## Testar
Abra `index.html` no navegador. Use **Simular chegada** e **Simular saída** para validar o fluxo. O botão **Usar minha localização** usa a API de geolocalização do navegador e compara com a latitude/longitude definidas em Configurações.

## Próxima etapa de produção
1. Migrar interface para Next.js/React Native.
2. Criar projeto Supabase e aplicar `schema.sql`.
3. Login por Supabase Auth.
4. Vinculação segura do dispositivo.
5. Geofence em background no app móvel.
6. Beacon BLE e/ou confirmação por Wi‑Fi corporativo.
7. API server-side para registrar horário do servidor.
8. RLS por empresa e funcionário.
9. Auditoria e solicitações de ajuste.
10. Revisão jurídica/trabalhista antes de usar como registro oficial de jornada.
