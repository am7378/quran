import json, re, collections, sys
S = json.load(open('.cache/qme_final.json', encoding='utf-8'))
OK = set("""Rasulullaah Muhammad Rasool Moosa Ibraheem Ambiyaa Nooh Isa Yusuf Aadam Adam Sulaymaan Sahabah Sahaabah Sahaaba Loot Lut Jibra'eel
Ya'qoob Haaroon Haroon Dawood Is'haaq Saalih Zakariyya Nabi Shu'ayb Ismaa'eel Isma'eel Ismaeel Hood Yunus Ayyoob Yahya Yusha Ilyaas Ilyas
Bakr Imraan Idrees Kifl Rasul Prophet Khidr Maryam Uzayr Uzair Hizqeel Shamweel Mika'eel Israafeel Yasa Israa'eel Umar Uthmaan Ali Maalik
Abbaas Aa'isha Zaid Haaritha Balta'ah Affaan Rumi Salaam Rasulullah Jibraeel Ambiya Suhayb Khadeeja Hafsa Safiyya Juwayriyya Ka'b Hilaal
Umayyah Rabee Murara Hatib Haatib Thaleba Jibrail Ismail Ibrahim Yousuf Ishaaq Sulayman Idris Luqmaan Dhul Yusha'""".split())
c = collections.Counter(); ex = {}
for k, segs in S.items():
    t = ' '.join(x for _, x in segs)
    for m in re.finditer(r"(\S+)\s+([ﷺ﵊﵁﵂﵃])", t):
        w = re.sub(r"^[^A-Za-z]+|[^A-Za-z']+$", "", m.group(1))
        if w not in OK:
            c[(w, m.group(2))] += 1; ex.setdefault((w, m.group(2)), k)
for (w, h), n in sorted(c.items(), key=lambda z: -z[1]):
    print(n, w, h, ex[(w, h)])
