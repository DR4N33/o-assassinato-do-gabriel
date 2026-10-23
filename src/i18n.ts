// Textos da área dos convidados em português e francês.
// A área da organização (André & Rosa) fica em português.
import type { Role } from "./crypto";

export type Lang = "pt" | "fr";
export const LANGS: Lang[] = ["pt", "fr"];

type Dict = {
  edition: string; eyebrow: string; tagline: [string, string, string]; truth: [string, string];
  fileMark: string; entry: string; enterTitle: string; enterText: string; codeLabel: string; codeHint: string;
  discover: string; opening: string; accessNote: [string, string]; footer: string; loading: string;
  unknownCode: string; notPublished: string; loadError: string;
  confidential: string; leave: string; tonight: string; hiddenFile: string; eyesOnly: string; show: string; hide: string;
  yourRole: string; closing: string; waitingTitle: [string, string]; waitingText: (name: string) => string; checkUpdates: string;
  codeOrPin: string; codeOrPinHint: string; pinTitle: string; pinText: string; pinLabel: string; pinConfirm: string; pinSave: string;
  pinMismatch: string; pinFormat: string; pinTaken: string; pinBad: string; codeReplaced: string; tooMany: string; network: string; pinNote: string;
  sections: Record<"story" | "secrets" | "alibi" | "information" | "objective", string>;
  roles: Record<Role, string>; roleMessages: Record<Role, string>;
};

export const T: Record<Lang, Dict> = {
  pt: {
    edition: "NINGUÉM ESTÁ A SALVO",
    eyebrow: "UMA FESTA. UM CRIME. UM DE NÓS.",
    tagline: ["Uma noite de Halloween.", "Um crime por resolver.", "O assassino está entre nós."],
    truth: ["A verdade tem muitas versões.", "Qual vai ser a tua?"],
    fileMark: "ARQUIVO PRIVADO", entry: "01 / ENTRADA",
    enterTitle: "Entra no mistério.",
    enterText: "Introduz o código secreto que a organização te enviou para descobrires o teu papel esta noite.",
    codeLabel: "O teu código", codeHint: "6 letras e números, por exemplo K7M-2QX.",
    discover: "Descobrir o meu papel", opening: "A abrir o dossiê…",
    accessNote: ["Acesso exclusivo a jogadores convidados.", "Guarda a tua personagem em segredo."],
    footer: "O assassino pode estar mesmo ao teu lado.",
    loading: "A abrir o teu dossiê…",
    unknownCode: "Código desconhecido. Confirma as letras e os números ou fala com a organização.",
    notPublished: "A festa ainda não foi publicada. Volta a tentar mais tarde.",
    loadError: "Não foi possível carregar o jogo. Tenta novamente.",
    confidential: "DOSSIÊ CONFIDENCIAL", leave: "Sair", tonight: "ESTA NOITE, TU ÉS",
    hiddenFile: "Dossiê oculto", eyesOnly: "Apenas para os teus olhos.", show: "Mostrar dossiê", hide: "Ocultar dossiê",
    yourRole: "O TEU PAPEL", closing: "Confia no teu instinto. Desconfia de todos.",
    waitingTitle: ["O teu papel", "está a caminho."],
    waitingText: (n) => `Olá, ${n}. A organização ainda está a decidir quem és esta noite.`,
    checkUpdates: "Verificar atualizações",
    codeOrPin: "O teu código ou PIN",
    codeOrPinHint: "1.ª vez: o código de 6 caracteres. Depois: o teu PIN de 4 dígitos.",
    pinTitle: "Cria o teu PIN.",
    pinText: "Escolhe 4 dígitos. A partir de agora entras só com eles — o código de 6 caracteres deixa de funcionar.",
    pinLabel: "PIN (4 dígitos)", pinConfirm: "Repetir o PIN", pinSave: "Guardar o meu PIN",
    pinMismatch: "Os dois PIN não coincidem.",
    pinFormat: "O PIN tem de ter exatamente 4 dígitos.",
    pinTaken: "Este PIN já está a ser usado por outro jogador. Escolhe outro.",
    pinBad: "PIN incorreto.",
    codeReplaced: "Este código já foi substituído por um PIN. Entra com o teu PIN — se o esqueceste, fala com a organização.",
    tooMany: "Demasiadas tentativas. Espera 10 minutos (ou usa os dados móveis em vez do Wi-Fi).",
    network: "Sem ligação ao servidor. Tenta outra vez.",
    pinNote: "Não partilhes o teu PIN com ninguém.",
    sections: { story: "A minha história", secrets: "O meu segredo", alibi: "O meu álibi", information: "O que sei", objective: "O meu objetivo" },
    roles: {
      assassino: "Assassino", cumplice: "Cúmplice", amante: "Amante", agressor: "Agressor", amiga: "Amiga", amigo: "Amigo",
      confidente: "Confidente", testemunha: "Testemunha", suspeito: "Suspeito", vitima: "Vítima",
    },
    roleMessages: {
      assassino: "Foste tu. Guarda este segredo e cabe-te escapar às suspeitas até ao fim da noite.",
      cumplice: "Sabes a verdade. Protege o assassino sem te denunciares.",
      amante: "Há uma paixão que ninguém pode descobrir. Protege o teu segredo… ou usa-o a teu favor.",
      agressor: "Houve violência esta noite, e tu estiveste no meio dela. Isso não faz de ti o assassino… pois não?",
      amiga: "Eras próxima do Gabriel. Ajuda a descobrir a verdade, mas lembra-te: também tens algo a esconder.",
      amigo: "Eras próximo do Gabriel. Ajuda a descobrir a verdade, mas lembra-te: também tens algo a esconder.",
      confidente: "Alguém te contou um segredo que pode mudar tudo. Guarda-o… ou escolhe bem o momento de o revelar.",
      testemunha: "Viste algo importante. Decide bem a quem o contas, e quando.",
      suspeito: "Estás inocente, mas toda a gente tem algo a esconder. Descobre quem está a mentir.",
      vitima: "O teu papel é especial. Segue as instruções do teu dossiê.",
    },
  },
  fr: {
    edition: "PERSONNE N'EST À L'ABRI",
    eyebrow: "UNE FÊTE. UN CRIME. L'UN D'ENTRE NOUS.",
    tagline: ["Une nuit d'Halloween.", "Un crime à résoudre.", "L'assassin est parmi nous."],
    truth: ["La vérité a plusieurs versions.", "Quelle sera la tienne ?"],
    fileMark: "ARCHIVE PRIVÉE", entry: "01 / ENTRÉE",
    enterTitle: "Entre dans le mystère.",
    enterText: "Saisis le code secret que l'organisation t'a envoyé pour découvrir ton rôle ce soir.",
    codeLabel: "Ton code", codeHint: "6 lettres et chiffres, par exemple K7M-2QX.",
    discover: "Découvrir mon rôle", opening: "Ouverture du dossier…",
    accessNote: ["Accès réservé aux joueurs invités.", "Garde ton personnage secret."],
    footer: "L'assassin est peut-être juste à côté de toi.",
    loading: "Ouverture de ton dossier…",
    unknownCode: "Code inconnu. Vérifie les lettres et les chiffres ou parle à l'organisation.",
    notPublished: "La fête n'a pas encore été publiée. Réessaie plus tard.",
    loadError: "Impossible de charger le jeu. Réessaie.",
    confidential: "DOSSIER CONFIDENTIEL", leave: "Quitter", tonight: "CE SOIR, TU ES",
    hiddenFile: "Dossier masqué", eyesOnly: "Rien que pour tes yeux.", show: "Afficher le dossier", hide: "Masquer le dossier",
    yourRole: "TON RÔLE", closing: "Fais confiance à ton instinct. Méfie-toi de tout le monde.",
    waitingTitle: ["Ton rôle", "arrive bientôt."],
    waitingText: (n) => `Salut ${n}. L'organisation décide encore qui tu seras ce soir.`,
    checkUpdates: "Vérifier les mises à jour",
    codeOrPin: "Ton code ou PIN",
    codeOrPinHint: "1re fois : le code à 6 caractères. Ensuite : ton PIN à 4 chiffres.",
    pinTitle: "Crée ton PIN.",
    pinText: "Choisis 4 chiffres. Désormais tu entres uniquement avec eux — le code à 6 caractères ne fonctionnera plus.",
    pinLabel: "PIN (4 chiffres)", pinConfirm: "Répète le PIN", pinSave: "Enregistrer mon PIN",
    pinMismatch: "Les deux PIN ne correspondent pas.",
    pinFormat: "Le PIN doit contenir exactement 4 chiffres.",
    pinTaken: "Ce PIN est déjà utilisé par un autre joueur. Choisis-en un autre.",
    pinBad: "PIN incorrect.",
    codeReplaced: "Ce code a déjà été remplacé par un PIN. Entre avec ton PIN — si tu l'as oublié, parle à l'organisation.",
    tooMany: "Trop de tentatives. Attends 10 minutes (ou utilise les données mobiles au lieu du Wi-Fi).",
    network: "Pas de connexion au serveur. Réessaie.",
    pinNote: "Ne partage ton PIN avec personne.",
    sections: { story: "Mon histoire", secrets: "Mon secret", alibi: "Mon alibi", information: "Ce que je sais", objective: "Mon objectif" },
    roles: {
      assassino: "Assassin", cumplice: "Complice", amante: "Amant(e)", agressor: "Agresseur", amiga: "Amie", amigo: "Ami",
      confidente: "Confident(e)", testemunha: "Témoin", suspeito: "Suspect", vitima: "Victime",
    },
    roleMessages: {
      assassino: "C'est toi. Garde ce secret et échappe aux soupçons jusqu'à la fin de la soirée.",
      cumplice: "Tu connais la vérité. Protège l'assassin sans te trahir.",
      amante: "Il y a une passion que personne ne doit découvrir. Protège ton secret… ou utilise-le à ton avantage.",
      agressor: "Il y a eu de la violence ce soir, et tu étais au milieu. Ça ne fait pas de toi l'assassin… n'est-ce pas ?",
      amiga: "Tu étais proche de Gabriel. Aide à découvrir la vérité, mais souviens-toi : toi aussi, tu as quelque chose à cacher.",
      amigo: "Tu étais proche de Gabriel. Aide à découvrir la vérité, mais souviens-toi : toi aussi, tu as quelque chose à cacher.",
      confidente: "Quelqu'un t'a confié un secret qui peut tout changer. Garde-le… ou choisis bien le moment de le révéler.",
      testemunha: "Tu as vu quelque chose d'important. Choisis bien à qui tu le dis, et quand.",
      suspeito: "Tu es innocent, mais tout le monde a quelque chose à cacher. Découvre qui ment.",
      vitima: "Ton rôle est spécial. Suis les instructions de ton dossier.",
    },
  },
};
