/**
 * TOON (Token-Oriented Object Notation) - Optimized for AI Context
 * FIELDS: id, sku, category, name, description, popular, available, options
 * OPTIONS: id:label:price:sku (separated by |)
 */

const toonData = `
1,PRD-LAB-JFSY,LAS INTOCABLES,La Bacon,Pan brillante medallón grueso de carne queso derretido tira de bacon crocante pepinillos y salsa Big Jack,true,true,simple:Clásica:17.90:PRD-LAB-JFSY|doble:Doble:22.90:PRD-LAB-JXVH
2,PRD-LAR-LUS0,LAS INTOCABLES,La Real con Huevo,Medallón de carne a la plancha queso fundido jamón inglés sellado y huevo de yema cremosa con nuestra salsa especial,false,true,simple:Clásica:15.90:PRD-LAR-LUS0|doble:Doble:22.90:PRD-LAR-N4R4
4,PRD-ALO-KC88,LAS INTOCABLES,La Pobre pero Fina,Medallón de carne jugosa cheddar huevo frito y plátano maduro caramelizado que combina dulce y salado,false,true,simple:Clásica:16.90:PRD-ALO-KC88|doble:Doble:22.90:PRD-ALO-LA72
7,PRD-LAM-IPH3,LAS INTOCABLES,La Misia,Hamburguesa clásica con su punto de sabor sencilla y directa,false,true,simple:Clásica:12.90:PRD-LAM-IPH3
30,PRD-INK-PXC0,BEBIDAS,Inka Cola 600ml,Botella helada 600 ml dulzona y chispeante,false,true,botella:Botella 600 ml:4.00:PRD-INK-PXC0
31,PRD-COC-QLER,BEBIDAS,Coca Cola 600ml,Botella helada 600 ml con burbujas intensas,false,true,botella:Botella 600 ml:4.00:PRD-COC-QLER
32,PRD-AGU-RC7G,BEBIDAS,Agua Cielo Personal,Agua embotellada personal,false,true,personal:Personal:2.00:PRD-AGU-RC7G
`.trim();

function parseTOON(data) {
    return data.split('\n').map(line => {
        const [id, sku, category, name, description, popular, available, optionsStr] = line.split(',');
        const options = optionsStr.split('|').map(opt => {
            const [optId, label, price, optSku] = opt.split(':');
            return { id: optId, sku: optSku || sku, label, price: parseFloat(price) };
        });
        return {
            id: parseInt(id),
            sku,
            category,
            name,
            description,
            popular: popular === 'true',
            available: available !== 'false',
            options
        };
    });
}

module.exports = parseTOON(toonData);
