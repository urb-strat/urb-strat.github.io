const supabase_url = "https://qtbysadfbkootuscgsri.supabase.co";
const supabase_key = "sb_publishable_1aGgWjC2uWsKk6AAw6uuKA_AhKzLEQN";

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(supabase_url, supabase_key);

const { data, error } = await supabase.from('Test Table').select('*');
if (error) console.error(error);
else console.log(data); // array of row objects