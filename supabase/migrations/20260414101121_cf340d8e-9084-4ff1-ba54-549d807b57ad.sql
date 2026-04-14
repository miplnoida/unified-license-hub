
-- Countries master table
CREATE TABLE public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  iso_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(iso_code)
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read countries" ON public.countries FOR SELECT TO public USING (true);
CREATE POLICY "Auth read countries" ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage countries" ON public.countries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- States master table
CREATE TABLE public.states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(country_id, name)
);

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read states" ON public.states FOR SELECT TO public USING (true);
CREATE POLICY "Auth read states" ON public.states FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage states" ON public.states FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_states_country_id ON public.states(country_id);

-- Seed countries
INSERT INTO public.countries (name, iso_code) VALUES
('United States', 'US'), ('United Kingdom', 'GB'), ('Canada', 'CA'), ('Australia', 'AU'),
('India', 'IN'), ('Germany', 'DE'), ('France', 'FR'), ('Nigeria', 'NG'),
('South Africa', 'ZA'), ('Kenya', 'KE'), ('Ghana', 'GH'), ('Jamaica', 'JM'),
('Trinidad and Tobago', 'TT'), ('Barbados', 'BB'), ('Bahamas', 'BS'),
('Singapore', 'SG'), ('United Arab Emirates', 'AE'), ('Japan', 'JP'),
('China', 'CN'), ('Brazil', 'BR'), ('Mexico', 'MX'), ('Ireland', 'IE'),
('Netherlands', 'NL'), ('Switzerland', 'CH'), ('Spain', 'ES'), ('Italy', 'IT'),
('New Zealand', 'NZ'), ('Malaysia', 'MY'), ('Philippines', 'PH'), ('Egypt', 'EG');

-- Seed US states
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Alabama'),('Alaska'),('Arizona'),('Arkansas'),('California'),('Colorado'),
('Connecticut'),('Delaware'),('Florida'),('Georgia'),('Hawaii'),('Idaho'),
('Illinois'),('Indiana'),('Iowa'),('Kansas'),('Kentucky'),('Louisiana'),
('Maine'),('Maryland'),('Massachusetts'),('Michigan'),('Minnesota'),('Mississippi'),
('Missouri'),('Montana'),('Nebraska'),('Nevada'),('New Hampshire'),('New Jersey'),
('New Mexico'),('New York'),('North Carolina'),('North Dakota'),('Ohio'),('Oklahoma'),
('Oregon'),('Pennsylvania'),('Rhode Island'),('South Carolina'),('South Dakota'),
('Tennessee'),('Texas'),('Utah'),('Vermont'),('Virginia'),('Washington'),
('West Virginia'),('Wisconsin'),('Wyoming'),('District of Columbia')) AS s(name)
WHERE c.iso_code = 'US';

-- Seed UK regions
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('England'),('Scotland'),('Wales'),('Northern Ireland')) AS s(name)
WHERE c.iso_code = 'GB';

-- Seed Canadian provinces
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Alberta'),('British Columbia'),('Manitoba'),('New Brunswick'),
('Newfoundland and Labrador'),('Nova Scotia'),('Ontario'),('Prince Edward Island'),
('Quebec'),('Saskatchewan'),('Northwest Territories'),('Nunavut'),('Yukon')) AS s(name)
WHERE c.iso_code = 'CA';

-- Seed Australian states
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('New South Wales'),('Victoria'),('Queensland'),('South Australia'),
('Western Australia'),('Tasmania'),('Northern Territory'),('Australian Capital Territory')) AS s(name)
WHERE c.iso_code = 'AU';

-- Seed Indian states (major)
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Andhra Pradesh'),('Bihar'),('Delhi'),('Goa'),('Gujarat'),('Haryana'),
('Karnataka'),('Kerala'),('Madhya Pradesh'),('Maharashtra'),('Punjab'),('Rajasthan'),
('Tamil Nadu'),('Telangana'),('Uttar Pradesh'),('West Bengal')) AS s(name)
WHERE c.iso_code = 'IN';

-- Seed Nigerian states (major)
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Lagos'),('Abuja FCT'),('Kano'),('Rivers'),('Oyo'),('Kaduna'),('Ogun'),('Enugu'),('Delta'),('Anambra')) AS s(name)
WHERE c.iso_code = 'NG';

-- Seed South African provinces
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Eastern Cape'),('Free State'),('Gauteng'),('KwaZulu-Natal'),('Limpopo'),
('Mpumalanga'),('North West'),('Northern Cape'),('Western Cape')) AS s(name)
WHERE c.iso_code = 'ZA';

-- Seed Kenyan counties (major)
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Nairobi'),('Mombasa'),('Kisumu'),('Nakuru'),('Kiambu'),('Machakos'),('Uasin Gishu')) AS s(name)
WHERE c.iso_code = 'KE';

-- Seed German states
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Baden-Württemberg'),('Bavaria'),('Berlin'),('Brandenburg'),('Bremen'),
('Hamburg'),('Hesse'),('Lower Saxony'),('Mecklenburg-Vorpommern'),('North Rhine-Westphalia'),
('Rhineland-Palatinate'),('Saarland'),('Saxony'),('Saxony-Anhalt'),('Schleswig-Holstein'),('Thuringia')) AS s(name)
WHERE c.iso_code = 'DE';

-- Seed UAE emirates
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Abu Dhabi'),('Dubai'),('Sharjah'),('Ajman'),('Umm Al Quwain'),('Ras Al Khaimah'),('Fujairah')) AS s(name)
WHERE c.iso_code = 'AE';

-- Seed Ghanaian regions
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Greater Accra'),('Ashanti'),('Western'),('Eastern'),('Central'),('Northern'),('Volta')) AS s(name)
WHERE c.iso_code = 'GH';

-- Seed Brazilian states (major)
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('São Paulo'),('Rio de Janeiro'),('Minas Gerais'),('Bahia'),('Paraná'),('Rio Grande do Sul'),('Pernambuco'),('Ceará')) AS s(name)
WHERE c.iso_code = 'BR';

-- Seed Mexican states (major)
INSERT INTO public.states (country_id, name)
SELECT c.id, s.name FROM public.countries c,
(VALUES ('Mexico City'),('Jalisco'),('Nuevo León'),('Puebla'),('Guanajuato'),('Veracruz'),('Chihuahua'),('Quintana Roo')) AS s(name)
WHERE c.iso_code = 'MX';
