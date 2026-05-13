const menu = [
  {
    id: 1,
    sku: "PRD-LAB-JFSY",
    slug: "la-bacon",
    category: "LAS INTOCABLES",
    name: "La Bacon",
    description: "Pan brillante, medallón grueso de carne, queso derretido, tira de bacon crocante, pepinillos y salsa Big Jack.",
    image: "/images/baconjack.webp",
    popular: true,
    options: [
      { id: "simple", sku: "PRD-LAB-JFSY", label: "Clásica (1 carne) - la de siempre", price: 17.90 },
      { id: "doble", sku: "PRD-LAB-JXVH", label: "Doble (2 carnes) - para llenarse", price: 22.90 }
    ]
  },
  {
    id: 2,
    sku: "PRD-LAR-LUS0",
    slug: "la-royal-con-huevo",
    category: "LAS INTOCABLES",
    name: "La Real con Huevo",
    description: "Medallón de carne a la plancha, queso fundido, jamón inglés sellado y huevo de yema cremosa con nuestra salsa especial.",
    image: "/images/royaljack.webp",
    popular: false,
    options: [
      { id: "simple", sku: "PRD-LAR-LUS0", label: "Clásica (1 carne) - para el antojo", price: 15.90 },
      { id: "doble", sku: "PRD-LAR-N4R4", label: "Doble (2 carnes) - full power", price: 22.90 }
    ]
  },
  {
    id: 3,
    sku: "BURG-005",
    slug: "grill-jack",
    category: "LAS INTOCABLES",
    name: "La Parrillera",
    description: "Burger gruesa con chorizo parrillero, cheddar, chimichurri casero y crema especial Big Jack.",
    image: "/images/grilljack.webp",
    popular: false,
    available: false,
    options: [
      { id: "simple", sku: "BURG-005", label: "Clásica (1 carne) - intensa", price: 17.90 },
      { id: "doble", sku: "BURG-006", label: "Doble (2 carnes) - bestial", price: 22.90 }
    ]
  },
  {
    id: 4,
    sku: "PRD-ALO-KC88",
    slug: "la-pobre-pero-fina",
    category: "LAS INTOCABLES",
    name: "La Pobre pero Fina",
    description: "Medallón de carne jugosa, cheddar, huevo frito y plátano maduro caramelizado que combina dulce y salado.",
    image: "/images/jackpobre.webp",
    popular: false,
    options: [
      { id: "simple", sku: "PRD-ALO-KC88", label: "Clásica (1 carne) - comfort", price: 16.90 },
      { id: "doble", sku: "PRD-ALO-LA72", label: "Doble (2 carnes) - contundente", price: 22.90 }
    ]
  },
  {
    id: 5,
    sku: "SNACK-001",
    slug: "choripan",
    category: "LAS INTOCABLES",
    name: "Choripan",
    description: "Chorizo parrillero jugoso en pan con chimichurri casero, cebolla caramelizada y un toque de mostaza.",
    image: "/images/choripan.webp",
    popular: false,
    available: false,
    options: [{ id: "simple", sku: "SNACK-001", label: "Clásico - sabor auténtico", price: 7.90 }]
  },
  {
    id: 6,
    sku: "SNACK-002",
    slug: "salchipapa",
    category: "LAS INTOCABLES",
    name: "Salchipapa",
    description: "Papas fritas doradas con salchicha cortada, bañadas en salsas de la casa. La opción 'Especial' incluye chorizo, queso y huevo.",
    image: "/images/salchipapa.webp",
    popular: false,
    available: false,
    options: [
      { id: "clasica", sku: "SNACK-002", label: "Clásica - con salchicha", price: 14.0 },
      { id: "chorizo", sku: "SNACK-003", label: "Con Chorizo - más intenso", price: 17.0 },
      { id: "especial", sku: "SNACK-004", label: "Especial - chorizo, queso y huevo", price: 20.0 }
    ]
  },
  {
    id: 7,
    sku: "PRD-LAM-IPH3",
    slug: "la-misia",
    category: "LAS INTOCABLES",
    name: "La Misia",
    description: "Hamburguesa clásica con su punto de sabor, sencilla y directa.",
    image: "/images/lamisia.webp",
    popular: false,
    options: [{ id: "simple", sku: "PRD-LAM-IPH3", label: "Clásica (1 carne)", price: 12.90 }]
  },
  {
    id: 20,
    sku: "SIDE-001",
    slug: "papas-fritas",
    category: "GUARNICION",
    name: "Papas Fritas - Nativas",
    description: "Corte rápidos, fritas al momento y terminadas con sal al punto.",
    image: "/images/papas-fritas.webp",
    popular: false,
    available: false,
    options: [{ id: "regular", sku: "SIDE-001", label: "Porción personal - para picar", price: 4.90 }]
  },
  {
    id: 30,
    sku: "PRD-INK-PXC0",
    slug: "inka-cola",
    category: "BEBIDAS",
    name: "Inka Cola 600ml",
    description: "Botella helada 600 ml, dulzona y chispeante.",
    image: "/images/inkacola.webp",
    popular: false,
    options: [{ id: "botella", sku: "PRD-INK-PXC0", label: "Botella 600 ml", price: 4.0 }]
  },
  {
    id: 31,
    sku: "PRD-COC-QLER",
    slug: "coca-cola",
    category: "BEBIDAS",
    name: "Coca Cola 600ml",
    description: "Botella helada 600 ml con burbujas intensas.",
    image: "/images/cocacola.webp",
    popular: false,
    options: [{ id: "botella", sku: "PRD-COC-QLER", label: "Botella 600 ml", price: 4.0 }]
  },
  {
    id: 32,
    sku: "PRD-AGU-RC7G",
    slug: "agua-cielo-personal",
    category: "BEBIDAS",
    name: "Agua Cielo Personal",
    description: "Agua embotellada personal.",
    image: "/images/agua-cielo.webp",
    popular: false,
    options: [{ id: "personal", sku: "PRD-AGU-RC7G", label: "Personal", price: 2.0 }]
  }
];

module.exports = menu;
