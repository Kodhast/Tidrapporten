# Beslut (ADR)

Ett beslut per fil. Mallen är [0000-mall.md](0000-mall.md); nya beslut skrivs med `/adr` i Claude
Code. 0002–0010 sammanfattar intervjun i issue 1–7.

| Nr                                                    | Beslut                                              | Status                                                            |
| ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-beslut-som-adr.md)                        | Beslut skrivs som ADR                               | Beslutat                                                          |
| [0002](0002-syfte-och-omfang.md)                      | Syfte och omfång                                    | Beslutat                                                          |
| [0003](0003-domanmodell.md)                           | Domänmodell                                         | Beslutat                                                          |
| [0004](0004-floden-och-granssnitt.md)                 | Flöden och gränssnitt                               | Beslutat                                                          |
| [0005](0005-teknik.md)                                | Teknik: React, Firebase och PWA                     | Beslutat                                                          |
| [0006](0006-inloggning-och-hosting.md)                | Inloggning och hosting på Cloudflare                | Beslutat, Pages Function i stället för Worker, detaljer i 0017    |
| [0007](0007-sakerhet-och-integritet.md)               | Säkerhet och integritet                             | Beslutat, backupen ersatt av 0018                                 |
| [0008](0008-kvalitet-test-och-loggning.md)            | Kvalitet, test och loggning                         | Beslutat                                                          |
| [0009](0009-repo-ci-och-miljoer.md)                   | Repo, CI och miljöer                                | Beslutat                                                          |
| [0010](0010-kostnadstak.md)                           | Kostnadstak                                         | Beslutat, stopp bara i testprojektet                              |
| [0011](0011-claude-code-och-arbetsflode.md)           | Claude Code och arbetsflödet                        | Beslutat                                                          |
| [0012](0012-datamodell.md)                            | Datamodell, låsning och flex                        | Beslutat, normens avrundning ersatt av 0013, kompletterat av 0016 |
| [0013](0013-normen-i-hela-kvartar.md)                 | Normen i hela kvartar                               | Beslutat                                                          |
| [0014](0014-functions-koden.md)                       | Var Functions-koden bor                             | Beslutat, katalogen flyttad av 0017                               |
| [0015](0015-firebase-projekt-och-region.md)           | Firebase-projekten och regionen                     | Beslutat                                                          |
| [0016](0016-loggade-andringar-som-paverkar-flexen.md) | Loggade ändringar som påverkar flexen               | Beslutat                                                          |
| [0017](0017-inloggningen.md)                          | Inloggningen: Access-JWT till Firebase custom token | Beslutat                                                          |
| [0018](0018-schemalagda-backuper.md)                  | Daglig backup med Firestores schemalagda backuper   | Beslutat                                                          |
