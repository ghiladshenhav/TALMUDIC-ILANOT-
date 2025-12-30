
import { isDictaAvailable, analyzeTextWithDicta } from './utils/dicta-local.ts';

async function testDicta() {
    console.log('🔄 Checking Dicta availability...');
    const status = await isDictaAvailable();
    console.log('📊 Status:', status);

    if (!status.available) {
        console.error('❌ Dicta not available');
        return;
    }

    const testText = `
    בזמן שהיה עוסק בתורה היה דומה למי שיושב בגן עדן, וכשהיה פוסק היה דומה למי שיושב במדבר.
    אמר רבי יוחנן: כל העוסק בתורה בלילה חוט של חסד משוך עליו ביום.
    `;

    console.log('\n🚀 Starting Analysis...');
    const result = await analyzeTextWithDicta(testText, '');
    console.log('\n✅ Result:', result);
}

testDicta().catch(console.error);
