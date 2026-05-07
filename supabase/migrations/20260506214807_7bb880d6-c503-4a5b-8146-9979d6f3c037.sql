
-- Define senha 123456 para todos os usuários existentes em auth.users
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now();

-- Insere registros em public.usuarios vinculados ao auth_user_id pelo email
WITH src(email, nome, cpf, role, is_admin) AS (
  VALUES
    ('franciscodeassi@ce.com','SAVA NILANE FIRMINO BEZERRA','83825703304','usuario',false),
    ('emultsistema@ce.com','MARIA DAGNA ESTEVAM','03229568389','usuario',false),
    ('jenni@sistemace.com','JENNI EVELLIN FELEX MOURA','03013198397','usuario',false),
    ('almoxarifadopereiro@gmail.com','José Carlos Queiroz de Sena','07465636396','almoxarifado',false),
    ('francisco@ce.com','ANTONIO FRANCISCO DIAS VIANA','07871327305','usuario',false),
    ('crioulassistema@ce.com','STEFANI DE OLIVEIRA DE AQUINO','60970877307','usuario',false),
    ('maeotaviasistema@ce.com','THAINARA PINHEIRO DE SOUZA','02949145361','usuario',false),
    ('rebeca@ce.com','REBECA CAVALCANTE CARVALHO','06296113358','usuario',false),
    ('donalilisistema@ce.com','ANTONIA LUANA DIOGENES','04727757311','usuario',false),
    ('gildodiogenes@sistema.com','Gildo Diogenes','60534365345','usuario',false),
    ('elaine.gerl@gmail.com','ELAINE FELIX RODRIGUES','06866849314','usuario',false),
    ('mariaclarasistema@ce.com','ANTONIA MARIA CLARA QUEIROZ','06188660351','usuario',false),
    ('donalilisistema03@ce.com','FRANCISCA ANDRESSA DA SILVA LAURINDO','06572491307','usuario',false),
    ('admin@pereiro.ce.gov.br','Administrador','','admin',true),
    ('dayana@sistemace.com','DAYANA DE AQUINO RODRIGUES','05414883335','usuario',false),
    ('farmaciamunicipalsistema@ce.com','NÁDIA TAINÁ ALVES DE LIMA','07797220352','usuario',false),
    ('odontologico@ce.com','ENOC BATISTA DE FREITAS','60536059306','usuario',false),
    ('dra.vitoriaff@gmail.com','VITORIA FREITAS DA SILVA','07738555300','usuario',false),
    ('joaoribeirosistema@ce.com','MARILIA CLESSIA PINHEIRO','03064769324','usuario',false),
    ('roberta@sistemace.com','ROBERTA SILVEIRA MACIEL','02398742342','usuario',false),
    ('ramon@sistemace.com','FRANCISCO RAMON RODRIGUES DA SILVA','05700794381','usuario',false),
    ('dyelse@sistemace.com','DYELSSE LARISSA DOS SANTOS','06852185389','usuario',false),
    ('kennedyq@gmail.com','KENNEDY QUEIROZ DE AQUINO','60536603375','usuario',false),
    ('lorena@sistemace.com','LORENA CINTIA ROCHA VIDAL','60535368305','usuario',false),
    ('monsenhorubs@sistema.com','Beatriz Dias Mendes','06279437302','usuario',false),
    ('monsenhorsistema@ce.com','MELISSA DIAS HOLANDA','03195826399','usuario',false)
)
INSERT INTO public.usuarios (auth_user_id, email, nome, cpf, role, is_admin, categorias_permitidas)
SELECT au.id, src.email, src.nome, src.cpf, src.role, src.is_admin, '[]'::jsonb
FROM src
JOIN auth.users au ON lower(au.email) = lower(src.email)
ON CONFLICT DO NOTHING;
