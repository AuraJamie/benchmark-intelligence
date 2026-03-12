export const autofillContract = (content, builder, project, date = new Date()) => {
    if (!content) return '';
    
    const data = {
        companyName: builder?.companyName || '[Company Name]',
        companyAddress: builder?.companyAddress || '[Company Address]',
        builderName: builder?.ownerName || '[Builder Name]',
        builderEmail: builder?.email || '[Builder Email]',
        builderPhone: builder?.phone || '[Builder Phone Number]',
        projectName: project?.address || '[Project Name/Address]',
        projectAddress: project?.address || '[Project Address]',
        date: date.toLocaleDateString('en-GB'),
        year: date.getFullYear(),
        day: date.getDate(),
        month: date.toLocaleString('default', { month: 'long' })
    };

    let result = content;
    Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, data[key]);
    });

    return result;
};

export const generateAccessKey = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
