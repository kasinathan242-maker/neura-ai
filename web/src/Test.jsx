import React from 'react';

export const Test = () => {
    console.log("Test component rendering");
    return (
        <div className="h-screen w-screen bg-black text-white flex items-center justify-center">
            <h1 className="text-4xl font-bold">SYSTEM ONLINE</h1>
        </div>
    );
};
