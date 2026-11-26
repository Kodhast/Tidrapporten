# 0019. Arbetsgivare och kunder över uppdragen

- **Status:** Beslutat
- **Datum:** 2026-11-26

## Sammanhang

I beslut 0012 är uppdraget översta nivån. Mottagarna ligger per uppdrag och har bara ett namn,
så arbetsgivaren och kunden skrivs in på nytt i varje uppdrag och hänger inte ihop. Ägaren vill ha
ett lager till: en kund kan stå för ett eller flera uppdrag, och arbetsgivaren kan ha ett eller
flera uppdrag. Startflödet vid första start (issue 64) behöver dessutom att arbetsgivaren blir
förvald första mottagare i varje nytt uppdrag. Underlag och ägarens val: issue 65.

## Beslut

Arbetsgivare och kunder blir egna dokument som uppdragen pekar på. Mottagarna ligger kvar per
uppdrag (0012) men kan länka till en arbetsgivare eller kund.

- **`employers/{id}`:** `name`, `suggestionMode` (förval för arbetsgivarens rapport),
  `archived`, `order`. Slumpat id.
- **`customers/{id}`:** `name`, `archived`, `order`. Slumpat id. En kund hör inte till en
  arbetsgivare, så samma kund kan ha uppdrag via flera arbetsgivare.
- **Uppdraget** får `employerId: Id | null` och `customerId: Id | null`. Nya uppdrag kräver
  arbetsgivare; kunden är valfri (internt uppdrag). Uppdrag utan fälten läses som `null`.
- **Mottagaren** får `party: { kind: 'employer' | 'customer'; id: Id } | null`, där `null` är en
  mellanhand eller annan mottagare. Namnet kopieras när mottagaren skapas och är sedan fritt: ett
  namnbyte på arbetsgivaren eller kunden ändrar inte mottagare som redan finns.
- **Nytt uppdrag** med arbetsgivare får arbetsgivaren som mottagare 1, så att flexen räknas mot
  den. Får kunden också veckorapporten blir den mottagare 2. Mottagarnas koder är uppdragets
  tidkoder, mappade ett till ett.

```ts
interface Employer {
	id: Id;
	name: string;
	suggestionMode: SuggestionMode;
	archived: boolean;
	order: number;
}

interface Customer {
	id: Id;
	name: string;
	archived: boolean;
	order: number;
}

// Added to Assignment
employerId: Id | null;
customerId: Id | null;

// Added to Receiver
party: { kind: 'employer' | 'customer'; id: Id } | null;
```

## Följder

- Arbetsgivaren skrivs in en gång, och inställningarna kan gruppera uppdragen under den.
- Uppdrag i drift sedan 1.0 har ingen arbetsgivare. De flyttas inte automatiskt; inställningarna
  visar "Välj arbetsgivare".
- Ett namnbyte syns inte hos befintliga mottagare. Det är ägarens val, och skickade rapporter har
  ändå namnet sparat i sin `snapshot`.
- Två nya samlingar ska in i reglerna, JSON-exporten, återställningen och rundturstestet
  (skill `datasakerhet`).
- Mellanhanden är inget eget dokument; vill ägaren återanvända den senare blir det ett nytt
  beslut.
