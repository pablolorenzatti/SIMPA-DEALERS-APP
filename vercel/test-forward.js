
const axios = require('axios');

async function testForwardLead() {
    console.log('Testing forward-lead endpoint...');
    try {
        const response = await axios.post('https://simpa-workflow-action.vercel.app/api/forward-lead', {
            inputFields: {
                dealer_name: "Test Dealer",
                contact_brand: "QJ Motor",
                contact_firstname: "Test",
                contact_lastname: "User",
                contact_email: "test@example.com",
                razon_social: "ROYAL MOTORS SA" // Known good RS to avoid inference complexity for this connectivity test
            }
        });
        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error Status:', error.response ? error.response.status : 'Unknown');
        console.error('Error Data:', error.response ? error.response.data : error.message);
    }
}

testForwardLead();
