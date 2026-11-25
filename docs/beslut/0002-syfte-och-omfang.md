# 0002. Syfte och omfång

- **Status:** Beslutat
- **Datum:** 2026-11-24

## Sammanhang

Tid registrerades i efterhand i ett privat kalkylark: inexakt, med dubbelinmatning, svårt att hålla
isär uppdrag och tidkoder, och rapporter som glömdes. Arbetsgivare och kunder får en förenklad
veckorapport, medan den faktiska tiden bara fanns i arket. Underlag från issue 1.

## Beslut

Appen ersätter arket och blir användarens egen sanning för faktiskt arbetad tid, med en flexbank.

- **Två tidslager:** faktisk tid registreras löpande; rapporterad tid skickas en gång i veckan.
  Appen föreslår veckorapporten, användaren justerar, och skillnaden blir flexen.
- **En användare** nu, men all data knyts till ett ägar-id från start. Inga roller, ingen delning.
- **Framgång:** flexsaldot syns direkt (totalt och per uppdrag), underlag för vilken vecka som
  helst tas fram på sekunder, och påminnelser gör att ingen dag glöms.
- **Ingen import** av historik; användaren börjar från noll med ett ingående saldo.

## Följder

- Både faktisk och rapporterad tid måste sparas per vecka, så att det går att visa hur arbetet
  faktiskt gick till.
- Ägar-id i varje dokument gör det möjligt att lägga till fler användare senare utan migrering
  av ägarskapet.
